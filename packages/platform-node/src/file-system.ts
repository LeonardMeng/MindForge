import {
  type Dirent,
  type Stats,
  existsSync,
  statSync,
  realpathSync,
  watch as watchFs,
} from 'node:fs';
import {
  link,
  open,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  unlink,
  lstat,
  mkdir,
  readFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, sep } from 'node:path';

import {
  isTempFileName,
  joinPath,
  normalizeName,
  normalizePath,
  parentPath,
  PlatformError,
  TEMP_FILE_PREFIX,
  type FileEntry,
  type FileStat,
  type FileSystem,
  type Unwatch,
  type WatchEvent,
} from '@mastery/platform';
import { ulid } from 'ulid';

import { errnoOf, toPlatformError } from './errors.js';

/** 默认只清理 10 分钟以前的临时文件。 */
const DEFAULT_TEMP_FILE_AGE_MS = 10 * 60 * 1000;
/** Windows 上 rename 遇到短暂占用（杀毒软件、索引服务）时的重试次数和间隔。 */
const RENAME_RETRIES = 10;
const RENAME_RETRY_DELAY_MS = 100;
const IS_WINDOWS = process.platform === 'win32';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** {@link NodeFileSystem.open} 的选项。 */
export interface NodeFileSystemOptions {
  /** 只给测试用的钩子。 */
  readonly hooks?: {
    /** 原子写入时，临时文件写完、改名之前调用；抛出错误可以模拟崩溃。 */
    readonly beforeRename?: (target: string) => void;
    /** 独占创建时，临时文件写完、建立硬链接之前调用；抛出错误可以模拟崩溃。 */
    readonly beforeLink?: (target: string) => void;
  };
}

/**
 * 基于 `node:fs` 的 {@link FileSystem}。CLI、无界面模式和 MCP 使用。
 *
 * - 原子写：在同一个目录里写临时文件 `.mastery-tmp-<ULID>`，fsync 后改名为目标文件，
 *   再尽量对目录做 fsync（Windows 不支持，跳过）。
 * - 跟随符号链接；解析后的真实路径在根目录外面时报 `platform.outside_root`。
 * - 容易因系统而异的情况先用 stat 检查，保证各系统报出相同的错误码。
 *
 * 用 {@link NodeFileSystem.open} 创建。
 */
export class NodeFileSystem implements FileSystem {
  readonly #root: string;
  readonly #hooks: NodeFileSystemOptions['hooks'];

  private constructor(root: string, options: NodeFileSystemOptions) {
    this.#root = root;
    this.#hooks = options.hooks;
  }

  /**
   * 以 `root` 为根目录打开文件系统。
   *
   * @param root - 已经存在的目录的绝对路径
   * @param options - 测试用的选项
   */
  static async open(
    root: string,
    options: NodeFileSystemOptions = {},
  ): Promise<NodeFileSystem> {
    if (!isAbsolute(root)) {
      throw new PlatformError('platform.invalid_path', {
        path: root,
        reason: 'root_not_absolute',
      });
    }
    let real: string;
    try {
      real = await realpath(root);
    } catch (error) {
      throw toPlatformError(error, root);
    }
    const info = await stat(real);
    if (!info.isDirectory())
      throw new PlatformError('platform.not_a_directory', { path: root });
    return new NodeFileSystem(real, options);
  }

  // ── 读写 ─────────────────────────────────────────────────────────────

  async readFile(path: string): Promise<Uint8Array> {
    const relative = normalizePath(path);
    const local = await this.#inside(relative);
    const info = await this.#statOrNull(local, relative);
    if (info === null)
      throw new PlatformError('platform.not_found', { path: relative });
    if (info.isDirectory())
      throw new PlatformError('platform.is_a_directory', { path: relative });
    try {
      return new Uint8Array(await readFile(local));
    } catch (error) {
      throw toPlatformError(error, relative);
    }
  }

  async readTextFile(path: string): Promise<string> {
    const bytes = await this.readFile(path);
    try {
      // 不去掉 BOM、遇到非法字节就报错，保证读后再写逐字节不变。
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
        bytes,
      );
    } catch {
      throw new PlatformError('platform.invalid_encoding', {
        path: normalizePath(path),
      });
    }
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    await this.#write(normalizePath(path), data);
  }

  async writeTextFile(path: string, text: string): Promise<void> {
    await this.#write(normalizePath(path), new TextEncoder().encode(text));
  }

  async createFile(path: string, data: Uint8Array): Promise<void> {
    await this.#create(normalizePath(path), data);
  }

  async createTextFile(path: string, text: string): Promise<void> {
    await this.#create(normalizePath(path), new TextEncoder().encode(text));
  }

  // ── 改名、删除、建目录 ───────────────────────────────────────────────────

  async rename(from: string, to: string): Promise<void> {
    const source = normalizePath(from);
    const target = normalizePath(to);
    if (source === '' || target === '') {
      throw new PlatformError('platform.invalid_path', {
        path: '',
        reason: 'root',
      });
    }
    const sourceLocal = await this.#inside(source);
    const targetLocal = await this.#inside(target);
    const sourceInfo = await this.#statOrNull(sourceLocal, source);
    if (sourceInfo === null)
      throw new PlatformError('platform.not_found', { path: source });
    await this.#requireParentDirectory(target);
    if (source === target) return;
    const targetInfo = await this.#statOrNull(targetLocal, target);
    if (sourceInfo.isDirectory()) {
      if (target.startsWith(`${source}/`)) {
        throw new PlatformError('platform.invalid_path', {
          path: target,
          reason: 'into_itself',
        });
      }
      if (targetInfo?.isFile() === true) {
        throw new PlatformError('platform.not_a_directory', { path: target });
      }
      if (targetInfo?.isDirectory() === true) {
        if ((await readdir(targetLocal)).length > 0) {
          throw new PlatformError('platform.not_empty', { path: target });
        }
        // Windows 不能把目录改名覆盖到已有的空目录上，先删掉它。
        await rmdir(targetLocal);
      }
    } else if (targetInfo?.isDirectory() === true) {
      throw new PlatformError('platform.is_a_directory', { path: target });
    }
    await this.#rename(sourceLocal, targetLocal, target);
  }

  async remove(
    path: string,
    options: { readonly recursive?: boolean } = {},
  ): Promise<void> {
    const relative = normalizePath(path);
    if (relative === '') {
      throw new PlatformError('platform.invalid_path', {
        path: '',
        reason: 'root',
      });
    }
    const local = await this.#inside(relative);
    try {
      const link = await lstat(local).catch(() => null);
      if (link?.isSymbolicLink() === true) {
        // 删除链接本身，不碰它指向的东西。
        await unlink(local);
        return;
      }
      const info = await this.#statOrNull(local, relative);
      if (info === null)
        throw new PlatformError('platform.not_found', { path: relative });
      if (!info.isDirectory()) {
        await unlink(local);
      } else if (options.recursive === true) {
        await rm(local, { recursive: true });
      } else {
        if ((await readdir(local)).length > 0) {
          throw new PlatformError('platform.not_empty', { path: relative });
        }
        await rmdir(local);
      }
    } catch (error) {
      throw toPlatformError(error, relative);
    }
  }

  async mkdir(
    path: string,
    options: { readonly recursive?: boolean } = {},
  ): Promise<void> {
    const relative = normalizePath(path);
    const local = await this.#inside(relative);
    const existing = await this.#statOrNull(local, relative);
    if (existing !== null) {
      if (existing.isDirectory() && options.recursive === true) return;
      throw new PlatformError('platform.already_exists', { path: relative });
    }
    if (options.recursive === true) {
      // 先找出路径上是不是有文件挡着，保证各系统报出同样的错误码。
      const segments = relative.split('/');
      for (let index = 1; index < segments.length; index++) {
        const prefix = segments.slice(0, index).join('/');
        const info = await this.#statOrNull(this.#local(prefix), prefix);
        if (info !== null && !info.isDirectory()) {
          throw new PlatformError('platform.not_a_directory', { path: prefix });
        }
      }
    } else {
      await this.#requireParentDirectory(relative);
    }
    try {
      await mkdir(local, { recursive: options.recursive === true });
    } catch (error) {
      throw toPlatformError(error, relative);
    }
  }

  // ── 查询 ─────────────────────────────────────────────────────────────

  async list(dir: string): Promise<FileEntry[]> {
    const relative = normalizePath(dir);
    const local = await this.#inside(relative);
    await this.#requireDirectory(local, relative);
    let entries: Dirent[];
    try {
      entries = await readdir(local, { withFileTypes: true });
    } catch (error) {
      throw toPlatformError(error, relative);
    }
    const result: FileEntry[] = [];
    for (const entry of entries) {
      const name = entry.name.normalize('NFC');
      if (isTempFileName(name) || !isValidName(name)) continue;
      const kind = await this.#entryKind(join(local, entry.name), entry);
      if (kind !== null) result.push({ name, kind });
    }
    return result.sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
  }

  async stat(path: string): Promise<FileStat | null> {
    const relative = normalizePath(path);
    const local = await this.#inside(relative);
    const info = await this.#statOrNull(local, relative);
    if (info === null || (!info.isFile() && !info.isDirectory())) return null;
    return {
      kind: info.isDirectory() ? 'directory' : 'file',
      size: info.isDirectory() ? 0 : info.size,
      modifiedAtMs: info.mtimeMs,
    };
  }

  watch(dir: string, listener: (event: WatchEvent) => void): Unwatch {
    const relative = normalizePath(dir);
    const local = this.#local(relative);
    this.#insideSync(local, relative);
    let info: Stats;
    try {
      info = statSync(local);
    } catch (error) {
      throw toPlatformError(error, relative);
    }
    if (!info.isDirectory())
      throw new PlatformError('platform.not_a_directory', { path: relative });

    let closed = false;
    const watcher = watchFs(
      local,
      { recursive: true },
      (eventType, filename) => {
        if (closed || filename === null) return;
        const rest = filename.split(sep).join('/').normalize('NFC');
        if (rest.split('/').some((segment) => isTempFileName(segment))) return;
        const path = joinPath(relative, rest);
        let kind: WatchEvent['kind'] = 'modified';
        if (eventType === 'rename') {
          // 改名事件分不清是创建还是删除：看文件现在还在不在。覆盖写入也会报成 created。
          kind = existsSync(join(local, filename)) ? 'created' : 'removed';
        }
        listener({ kind, path });
      },
    );
    watcher.on('error', () => {
      // 事件只是提示；监听出错时停止送达，使用者通过重新扫描对账。
      closed = true;
    });
    return () => {
      if (closed) return;
      closed = true;
      watcher.close();
    };
  }

  async cleanupTempFiles(
    dir: string,
    options: { readonly olderThanMs?: number } = {},
  ): Promise<string[]> {
    const relative = normalizePath(dir);
    const local = await this.#inside(relative);
    await this.#requireDirectory(local, relative);
    const olderThanMs = options.olderThanMs ?? DEFAULT_TEMP_FILE_AGE_MS;
    const removed: string[] = [];
    const walk = async (
      directory: string,
      directoryLocal: string,
    ): Promise<void> => {
      for (const entry of await readdir(directoryLocal, {
        withFileTypes: true,
      })) {
        const name = entry.name.normalize('NFC');
        const entryLocal = join(directoryLocal, entry.name);
        const entryPath = joinPath(directory, name);
        if (entry.isDirectory()) {
          if (isValidName(name)) await walk(entryPath, entryLocal);
        } else if (entry.isFile() && isTempFileName(name)) {
          const info = await stat(entryLocal);
          if (Date.now() - info.mtimeMs > olderThanMs) {
            await unlink(entryLocal);
            removed.push(entryPath);
          }
        }
      }
    };
    try {
      await walk(relative, local);
    } catch (error) {
      throw toPlatformError(error, relative);
    }
    return removed.sort();
  }

  // ── 内部 ─────────────────────────────────────────────────────────────

  /** 相对路径对应的本地路径（不检查符号链接）。 */
  #local(relative: string): string {
    return relative === ''
      ? this.#root
      : join(this.#root, ...relative.split('/'));
  }

  #isInsideRoot(real: string): boolean {
    return real === this.#root || real.startsWith(this.#root + sep);
  }

  /**
   * 返回本地路径，并确认它（或它最近的已存在的上级）解析后仍在根目录里面。
   * 否则报 `platform.outside_root`。
   */
  async #inside(relative: string): Promise<string> {
    const local = this.#local(relative);
    let current = local;
    for (;;) {
      try {
        const real = await realpath(current);
        if (!this.#isInsideRoot(real)) {
          throw new PlatformError('platform.outside_root', { path: relative });
        }
        return local;
      } catch (error) {
        if (error instanceof PlatformError) throw error;
        const errno = errnoOf(error);
        if (errno !== 'ENOENT' && errno !== 'ENOTDIR')
          throw toPlatformError(error, relative);
        const parent = dirname(current);
        if (parent === current || current === this.#root) return local;
        current = parent;
      }
    }
  }

  /** {@link NodeFileSystem.#inside} 的同步版本（`watch` 是同步接口）。 */
  #insideSync(local: string, relative: string): void {
    let current = local;
    for (;;) {
      try {
        const real = realpathSync(current);
        if (!this.#isInsideRoot(real)) {
          throw new PlatformError('platform.outside_root', { path: relative });
        }
        return;
      } catch (error) {
        if (error instanceof PlatformError) throw error;
        const errno = errnoOf(error);
        if (errno !== 'ENOENT' && errno !== 'ENOTDIR')
          throw toPlatformError(error, relative);
        const parent = dirname(current);
        if (parent === current || current === this.#root) return;
        current = parent;
      }
    }
  }

  /** 跟随符号链接的 stat；不存在时返回 null。 */
  async #statOrNull(local: string, relative: string): Promise<Stats | null> {
    try {
      return await stat(local);
    } catch (error) {
      const errno = errnoOf(error);
      if (errno === 'ENOENT' || errno === 'ENOTDIR') return null;
      throw toPlatformError(error, relative);
    }
  }

  async #requireDirectory(local: string, relative: string): Promise<void> {
    const info = await this.#statOrNull(local, relative);
    if (info === null)
      throw new PlatformError('platform.not_found', { path: relative });
    if (!info.isDirectory())
      throw new PlatformError('platform.not_a_directory', { path: relative });
  }

  async #requireParentDirectory(relative: string): Promise<void> {
    const parent = parentPath(relative);
    const info = await this.#statOrNull(this.#local(parent), parent);
    if (info === null)
      throw new PlatformError('platform.not_found', { path: parent });
    if (!info.isDirectory())
      throw new PlatformError('platform.not_a_directory', { path: parent });
  }

  /** 目录项的类型：跟随符号链接；断开的、指向根目录外面的链接和特殊文件返回 null。 */
  async #entryKind(
    local: string,
    entry: Dirent,
  ): Promise<FileEntry['kind'] | null> {
    if (entry.isFile()) return 'file';
    if (entry.isDirectory()) return 'directory';
    if (!entry.isSymbolicLink()) return null;
    try {
      const real = await realpath(local);
      if (!this.#isInsideRoot(real)) return null;
      const info = await stat(real);
      if (info.isFile()) return 'file';
      if (info.isDirectory()) return 'directory';
      return null;
    } catch {
      return null;
    }
  }

  /** 先写临时文件并 fsync，再改名为目标文件。 */
  async #write(relative: string, data: Uint8Array): Promise<void> {
    if (relative === '')
      throw new PlatformError('platform.is_a_directory', { path: relative });
    const local = await this.#inside(relative);
    await this.#requireParentDirectory(relative);
    const existing = await this.#statOrNull(local, relative);
    if (existing?.isDirectory() === true) {
      throw new PlatformError('platform.is_a_directory', { path: relative });
    }
    const directory = dirname(local);
    const temp = join(directory, `${TEMP_FILE_PREFIX}${ulid()}`);
    try {
      const handle = await open(temp, 'wx');
      try {
        await handle.writeFile(data);
        await handle.sync();
      } finally {
        await handle.close();
      }
      this.#hooks?.beforeRename?.(local);
      await this.#rename(temp, local, relative);
    } catch (error) {
      await rm(temp, { force: true }).catch(() => undefined);
      throw toPlatformError(error, relative);
    }
    await syncDirectory(directory);
  }

  /**
   * 独占创建：先写临时文件并 fsync，再用 `link(临时文件, 目标)` 建立硬链接。
   * `link` 在目标已存在时失败（包括 NTFS），所以既是原子的也是独占的；最后删掉临时文件的名字。
   */
  async #create(relative: string, data: Uint8Array): Promise<void> {
    if (relative === '') {
      throw new PlatformError('platform.already_exists', { path: relative });
    }
    const local = await this.#inside(relative);
    await this.#requireParentDirectory(relative);
    const existing = await lstat(local).catch(() => null);
    if (existing !== null) {
      throw new PlatformError('platform.already_exists', { path: relative });
    }
    const directory = dirname(local);
    const temp = join(directory, `${TEMP_FILE_PREFIX}${ulid()}`);
    try {
      const handle = await open(temp, 'wx');
      try {
        await handle.writeFile(data);
        await handle.sync();
      } finally {
        await handle.close();
      }
      this.#hooks?.beforeLink?.(local);
      await link(temp, local);
    } catch (error) {
      await rm(temp, { force: true }).catch(() => undefined);
      throw toPlatformError(error, relative);
    }
    // 目标已经建好；临时文件的名字删不掉也不影响结果，以后由 cleanupTempFiles 清理。
    await unlink(temp).catch(() => undefined);
    await syncDirectory(directory);
  }

  /** rename；Windows 上遇到短暂占用时重试。 */
  async #rename(from: string, to: string, relative: string): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await rename(from, to);
        return;
      } catch (error) {
        const errno = errnoOf(error);
        const transient =
          errno === 'EPERM' || errno === 'EACCES' || errno === 'EBUSY';
        if (!IS_WINDOWS || !transient || attempt >= RENAME_RETRIES) {
          throw toPlatformError(error, relative);
        }
        await sleep(RENAME_RETRY_DELAY_MS);
      }
    }
  }
}

/** 是不是合法的路径段（别的工具可能创建了 Windows 不允许或带控制字符的名字）。 */
function isValidName(name: string): boolean {
  try {
    normalizeName(name);
    return true;
  } catch {
    return false;
  }
}

/** 尽量对目录做 fsync，让改名本身也落盘。Windows 不支持，跳过；失败也不影响写入结果。 */
async function syncDirectory(directory: string): Promise<void> {
  if (IS_WINDOWS) return;
  try {
    const handle = await open(directory, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // 有的文件系统不支持对目录 fsync。
  }
}
