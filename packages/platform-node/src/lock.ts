import {
  link,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';

import {
  normalizeName,
  PlatformError,
  type Lock,
  type LockHandle,
} from '@mastery/platform';
import { ulid } from 'ulid';

import { errnoOf, toPlatformError } from './errors.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_STALE_AFTER_MS = 2 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 50;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const IS_WINDOWS = process.platform === 'win32';

/**
 * Windows 上，文件被删除时如果还有别的句柄开着（比如另一个进程正在读锁文件），它会处于
 * “删除挂起”状态：名字还在，但打开、创建、改名都会报 EPERM 或 EACCES，直到最后一个句柄关闭。
 * 这只是暂时的，按“锁正忙”处理，稍后再试。其他系统上这两个错误是真正的权限问题。
 */
function isBusyOnWindows(error: unknown): boolean {
  const errno = errnoOf(error);
  return IS_WINDOWS && (errno === 'EPERM' || errno === 'EACCES');
}

/** 锁文件暂时打不开（Windows 的删除挂起），见 {@link isBusyOnWindows}。 */
const BUSY = 'busy';

/** 锁文件的内容。心跳是锁文件的修改时间，由持有者定期更新。 */
interface LockFileContent {
  readonly token: string;
  readonly pid: number;
  readonly hostname: string;
  readonly acquired_at: string;
}

/** 清除过期锁时报告的信息。 */
export interface StaleLockInfo {
  /** 锁名。 */
  readonly name: string;
  /** 锁文件的路径。 */
  readonly path: string;
  /** 为什么判定为过期。 */
  readonly reason: 'process_gone' | 'heartbeat_expired';
  /** 原持有者（锁文件损坏时为 null）。 */
  readonly holder: { readonly pid: number; readonly hostname: string } | null;
  /** 原持有者最后一次心跳距今的毫秒数。 */
  readonly heartbeatAgeMs: number;
}

/** {@link NodeLock} 的选项。 */
export interface NodeLockOptions {
  /** 持有者更新心跳的间隔，默认 30 秒。 */
  readonly heartbeatIntervalMs?: number;
  /** 心跳超过这么久没有更新就视为过期，默认 2 分钟。 */
  readonly staleAfterMs?: number;
  /** 等锁时检查的间隔，默认 50 毫秒。 */
  readonly pollIntervalMs?: number;
  /**
   * 清除过期锁时调用，留下记录。默认用 `process.emitWarning` 发出一条 `MasteryStaleLock` 警告。
   */
  readonly onStaleLock?: (info: StaleLockInfo) => void;
  /** 只给测试用的钩子。 */
  readonly hooks?: {
    /** 判定锁已过期之后、开始接管之前调用（测试用它制造两个进程同时接管的竞争）。 */
    readonly afterStaleCheck?: () => Promise<void>;
    /** 独占创建锁文件之前调用；抛出带 `code` 的错误可以模拟系统错误（比如 Windows 的 EPERM）。 */
    readonly beforeCreate?: () => void;
    /** 读取锁文件之前调用；用法同 `beforeCreate`。 */
    readonly beforeRead?: () => void;
  };
}

/**
 * 基于锁文件的跨进程 {@link Lock}。锁文件是 `<lockDir>/<name>.lock`。
 *
 * - 获取：用独占创建（`wx`）写入锁文件，内容是令牌、进程号和主机名。
 * - 心跳：持有期间每隔 `heartbeatIntervalMs` 更新锁文件的修改时间。
 * - 过期：心跳超过 `staleAfterMs` 没有更新（不管是不是同一台主机），或者同一台主机上持有者进程已经不在。
 * - 接管过期锁是原子的：先把锁文件改名成唯一的名字（只有一个进程能成功），再用 `wx` 写入新锁；
 *   改名失败的一方按“锁被别人占用”处理。每次接管都通过 `onStaleLock` 留下记录。
 */
export class NodeLock implements Lock {
  readonly #dir: string;
  readonly #heartbeatIntervalMs: number;
  readonly #staleAfterMs: number;
  readonly #pollIntervalMs: number;
  readonly #onStaleLock: (info: StaleLockInfo) => void;
  readonly #hooks: NodeLockOptions['hooks'];

  /**
   * @param lockDir - 存放锁文件的目录（绝对路径），不存在时自动创建
   * @param options - 心跳、过期时间等
   */
  constructor(lockDir: string, options: NodeLockOptions = {}) {
    this.#dir = lockDir;
    this.#heartbeatIntervalMs =
      options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.#staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
    this.#pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.#onStaleLock = options.onStaleLock ?? warnStaleLock;
    this.#hooks = options.hooks;
  }

  async acquire(
    name: string,
    options: { readonly timeoutMs?: number } = {},
  ): Promise<LockHandle> {
    const lockName = normalizeName(name);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    const path = join(this.#dir, `${lockName}.lock`);
    try {
      await mkdir(this.#dir, { recursive: true });
    } catch (error) {
      throw toPlatformError(error, this.#dir);
    }

    for (;;) {
      const token = ulid();
      const created = await this.#tryCreate(path, token);
      if (created === true) return this.#handle(path, token);

      const current = created === BUSY ? created : await this.#read(path);
      if (current === BUSY) {
        // Windows 的删除挂起：稍后再试。到期时还是这样，多半是真正的权限问题，照实报告。
        if (Date.now() >= deadline) {
          throw new PlatformError('platform.permission_denied', { path });
        }
        await sleep(this.#pollIntervalMs);
        continue;
      }
      if (current !== null) {
        const reason = this.#staleReason(current);
        if (reason !== null) {
          await this.#hooks?.afterStaleCheck?.();
          if (await this.#takeOver(lockName, path, current, reason)) continue;
        }
      } else {
        // 锁文件刚好被释放了：马上重试。
        continue;
      }

      if (Date.now() >= deadline) {
        const params: Record<string, string | number> = {
          name: lockName,
          timeoutMs,
        };
        if (current.content !== null) {
          params.holder_pid = current.content.pid;
          params.holder_hostname = current.content.hostname;
        }
        throw new PlatformError('platform.lock_timeout', params);
      }
      await sleep(this.#pollIntervalMs);
    }
  }

  /** 用独占创建写入锁文件；已存在时返回 false，Windows 上暂时打不开时返回 `busy`。 */
  async #tryCreate(
    path: string,
    token: string,
  ): Promise<boolean | typeof BUSY> {
    const content: LockFileContent = {
      token,
      pid: process.pid,
      hostname: hostname(),
      acquired_at: new Date().toISOString(),
    };
    try {
      this.#hooks?.beforeCreate?.();
      await writeFile(path, JSON.stringify(content), { flag: 'wx' });
      return true;
    } catch (error) {
      if (errnoOf(error) === 'EEXIST') return false;
      if (isBusyOnWindows(error)) return BUSY;
      throw toPlatformError(error, path);
    }
  }

  #staleReason(current: CurrentLock): StaleLockInfo['reason'] | null {
    if (Date.now() - current.modifiedAtMs > this.#staleAfterMs)
      return 'heartbeat_expired';
    const holder = current.content;
    if (
      holder !== null &&
      holder.hostname === hostname() &&
      !isProcessAlive(holder.pid)
    ) {
      return 'process_gone';
    }
    return null;
  }

  /**
   * 原子地接管过期锁：把锁文件改名成唯一的名字，只有一个进程能成功。
   * 返回 true 表示过期锁已经清除，可以马上重新尝试创建。
   */
  async #takeOver(
    name: string,
    path: string,
    judged: CurrentLock,
    reason: StaleLockInfo['reason'],
  ): Promise<boolean> {
    const moved = `${path}.stale-${ulid()}`;
    try {
      await rename(path, moved);
    } catch (error) {
      // 别人已经接管（或锁已释放），或者 Windows 上正在删除：按“锁被占用”处理，下一轮再看。
      if (errnoOf(error) === 'ENOENT' || isBusyOnWindows(error)) return false;
      throw toPlatformError(error, path);
    }
    const read = await this.#read(moved);
    const taken = read === BUSY ? null : read;
    if (taken?.content?.token !== judged.content?.token) {
      // 判定过期之后、改名之前，锁已经换了新的持有者：把它还回去（link 是原子的，目标已存在时失败）。
      await link(moved, path).catch(() => undefined);
      await unlink(moved).catch(() => undefined);
      return false;
    }
    await unlink(moved).catch(() => undefined);
    this.#onStaleLock({
      name,
      path,
      reason,
      holder:
        judged.content === null
          ? null
          : { pid: judged.content.pid, hostname: judged.content.hostname },
      heartbeatAgeMs: Date.now() - judged.modifiedAtMs,
    });
    return true;
  }

  #handle(path: string, token: string): LockHandle {
    const heartbeat = setInterval(() => {
      const now = new Date();
      utimes(path, now, now).catch(() => undefined);
    }, this.#heartbeatIntervalMs);
    heartbeat.unref();
    let released = false;
    return {
      release: async () => {
        if (released) return;
        released = true;
        clearInterval(heartbeat);
        // 只删除自己的锁：如果锁已经被别人接管，不能删掉别人的。
        const current = await this.#read(path);
        // 正在删除（BUSY）说明已经不是我们的了。
        if (current !== BUSY && current?.content?.token === token) {
          await rm(path, { force: true });
        }
      },
    };
  }

  /** 读取锁文件；文件不存在时返回 null，Windows 上暂时打不开时返回 `busy`。 */
  async #read(path: string): Promise<CurrentLock | null | typeof BUSY> {
    try {
      this.#hooks?.beforeRead?.();
      const [text, info] = await Promise.all([
        readFile(path, 'utf8'),
        stat(path),
      ]);
      return { content: parseLock(text), modifiedAtMs: info.mtimeMs };
    } catch (error) {
      if (errnoOf(error) === 'ENOENT') return null;
      if (isBusyOnWindows(error)) return BUSY;
      throw toPlatformError(error, path);
    }
  }
}

/** 锁文件的当前状态。 */
interface CurrentLock {
  /** 锁文件损坏（比如别的进程刚创建、还没写完）时为 null。 */
  readonly content: LockFileContent | null;
  /** 修改时间，即最后一次心跳。 */
  readonly modifiedAtMs: number;
}

function parseLock(text: string): LockFileContent | null {
  try {
    const value: unknown = JSON.parse(text);
    if (
      typeof value === 'object' &&
      value !== null &&
      'token' in value &&
      'pid' in value &&
      'hostname' in value &&
      typeof value.token === 'string' &&
      typeof value.pid === 'number' &&
      typeof value.hostname === 'string'
    ) {
      return value as LockFileContent;
    }
    return null;
  } catch {
    return null;
  }
}

/** 同一台主机上的进程是否还在。 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM：进程存在，只是没有权限给它发信号。
    return errnoOf(error) === 'EPERM';
  }
}

/** 默认的记录方式：发出一条 Node 警告，不能悄悄清除过期锁。 */
function warnStaleLock(info: StaleLockInfo): void {
  const holder =
    info.holder === null
      ? 'unknown holder'
      : `pid ${String(info.holder.pid)} on ${info.holder.hostname}`;
  process.emitWarning(
    `removed stale lock "${info.name}" (${info.reason}, ${holder}, last heartbeat ${String(Math.round(info.heartbeatAgeMs / 1000))} s ago)`,
    'MasteryStaleLock',
  );
}
