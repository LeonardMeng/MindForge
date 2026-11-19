import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';

import { TEMP_FILE_PREFIX } from '@mastery/platform';
import {
  describeClockContract,
  describeFileSystemContract,
  describeIdGeneratorContract,
  describeLockContract,
  expectPlatformError,
  type SymlinkTarget,
} from '@mastery/platform/contract';
import { ulid } from 'ulid';
import { afterAll, describe, expect, it } from 'vitest';

import {
  createNodePlatform,
  NodeFileSystem,
  NodeIdGenerator,
  NodeLock,
  SystemClock,
  type StaleLockInfo,
} from './index.js';

// ── 测试用的临时目录 ───────────────────────────────────────────────────────
const created: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mastery-node-'));
  created.push(dir);
  return dir;
}
afterAll(async () => {
  await Promise.all(
    created.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

/** 当前环境能不能创建符号链接（Windows 上可能需要权限）。 */
async function supportsSymlinks(): Promise<boolean> {
  const dir = await tempDir();
  try {
    await writeFile(join(dir, 'target'), 'x');
    await symlink(join(dir, 'target'), join(dir, 'link'), 'file');
    return true;
  } catch {
    return false;
  }
}
const SYMLINKS = await supportsSymlinks();

/** 一个已经结束的进程的进程号。 */
function deadPid(): number {
  const result = spawnSync(process.execPath, ['-e', '']);
  return result.pid ?? 999_999;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ── 契约测试：和内存实现、Tauri 实现通过同一套测试 ──────────────────────────
describeFileSystemContract(
  'node',
  async () => {
    const root = await tempDir();
    const outside = await tempDir();
    await writeFile(join(outside, 'secret.txt'), 'secret');
    const fs = await NodeFileSystem.open(root);
    const local = (path: string) => join(root, ...path.split('/'));
    return {
      fs,
      async leaveTempFile(dir, ageMs) {
        const name = `${TEMP_FILE_PREFIX}${ulid()}`;
        const path = dir === '' ? name : `${dir}/${name}`;
        await writeFile(local(path), 'half');
        const time = new Date(Date.now() - ageMs);
        await utimes(local(path), time, time);
        return path;
      },
      async symlink(path: string, target: SymlinkTarget) {
        if (target === 'outside-dir')
          await symlink(outside, local(path), 'junction');
        else if (target === 'outside-file') {
          await symlink(join(outside, 'secret.txt'), local(path), 'file');
        } else if (target === 'broken')
          await symlink(local('missing'), local(path), 'file');
        else {
          await symlink(
            local(target.inside),
            local(path),
            target.directory ? 'junction' : 'file',
          );
        }
      },
    };
  },
  { symlinks: SYMLINKS },
);
describeClockContract('node', () => new SystemClock());
describeIdGeneratorContract('node', () => new NodeIdGenerator());
describeLockContract('node', async () => {
  const dir = await tempDir();
  return { first: new NodeLock(dir), second: new NodeLock(dir) };
});

// ── Node 特有的行为 ───────────────────────────────────────────────────────
describe('NodeFileSystem', () => {
  it('requires an absolute root that exists', async () => {
    await expectPlatformError(
      NodeFileSystem.open('relative/root'),
      'platform.invalid_path',
    );
    await expectPlatformError(
      NodeFileSystem.open(join(await tempDir(), 'missing')),
      'platform.not_found',
    );
  });

  it('writes through a temp file: a failed rename leaves the target unchanged', async () => {
    const root = await tempDir();
    let fail = false;
    const fs = await NodeFileSystem.open(root, {
      hooks: {
        beforeRename: () => {
          if (fail) throw new Error('simulated crash before rename');
        },
      },
    });
    await fs.writeTextFile('a.md', 'old');
    fail = true;
    await expect(fs.writeTextFile('a.md', 'new')).rejects.toThrow(
      'simulated crash',
    );
    expect(await readFile(join(root, 'a.md'), 'utf8')).toBe('old');
    // 失败的写入会尽量删掉自己的临时文件。
    expect(
      (await readdir(root)).filter((name) => name.startsWith(TEMP_FILE_PREFIX)),
    ).toEqual([]);
  });

  it('skips names that are not valid paths, like "a?.md" created by another tool', async () => {
    if (process.platform === 'win32') return; // Windows 本身就不允许这个名字。
    const root = await tempDir();
    await writeFile(join(root, 'a?.md'), 'x');
    await writeFile(join(root, 'ok.md'), 'x');
    const fs = await NodeFileSystem.open(root);
    expect(await fs.list('')).toEqual([{ name: 'ok.md', kind: 'file' }]);
  });

  it.runIf(process.platform === 'darwin')(
    'finds a file stored in NFD by its NFC name (macOS)',
    async () => {
      const root = await tempDir();
      await writeFile(join(root, 'résumé.md'), 'x');
      const fs = await NodeFileSystem.open(root);
      expect(await fs.list('')).toEqual([{ name: 'résumé.md', kind: 'file' }]);
      expect(await fs.readTextFile('résumé.md')).toBe('x');
    },
  );
});

describe('NodeLock', () => {
  /** 直接写一个锁文件，模拟别的进程（或别的主机）持有的锁。 */
  async function plantLock(
    dir: string,
    name: string,
    holder: { pid: number; hostname: string; heartbeatAgeMs?: number },
  ): Promise<string> {
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${name}.lock`);
    await writeFile(
      path,
      JSON.stringify({
        token: ulid(),
        pid: holder.pid,
        hostname: holder.hostname,
        acquired_at: new Date().toISOString(),
      }),
    );
    const time = new Date(Date.now() - (holder.heartbeatAgeMs ?? 0));
    await utimes(path, time, time);
    return path;
  }

  it('takes over a lock whose holder process no longer exists on this host, and reports it', async () => {
    const dir = await tempDir();
    await plantLock(dir, 'write', { pid: deadPid(), hostname: hostname() });
    const reports: StaleLockInfo[] = [];
    const lock = new NodeLock(dir, {
      onStaleLock: (info) => reports.push(info),
    });
    const handle = await lock.acquire('write', { timeoutMs: 2000 });
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ name: 'write', reason: 'process_gone' });
    await handle.release();
  });

  it('takes over a lock whose heartbeat is too old, even from another host', async () => {
    const dir = await tempDir();
    await plantLock(dir, 'write', {
      pid: process.pid,
      hostname: 'some-other-host',
      heartbeatAgeMs: 10_000,
    });
    const reports: StaleLockInfo[] = [];
    const lock = new NodeLock(dir, {
      staleAfterMs: 5_000,
      onStaleLock: (info) => reports.push(info),
    });
    const handle = await lock.acquire('write', { timeoutMs: 2000 });
    expect(reports).toMatchObject([{ reason: 'heartbeat_expired' }]);
    await handle.release();
  });

  it('also checks the heartbeat on this host (process ids can be reused)', async () => {
    const dir = await tempDir();
    // 进程号还活着（就是测试进程自己），但心跳已经过期。
    await plantLock(dir, 'write', {
      pid: process.pid,
      hostname: hostname(),
      heartbeatAgeMs: 10_000,
    });
    const reports: StaleLockInfo[] = [];
    const lock = new NodeLock(dir, {
      staleAfterMs: 5_000,
      onStaleLock: (info) => reports.push(info),
    });
    const handle = await lock.acquire('write', { timeoutMs: 2000 });
    expect(reports).toMatchObject([{ reason: 'heartbeat_expired' }]);
    await handle.release();
  });

  it('waits for a live lock from another host and reports the holder on timeout', async () => {
    const dir = await tempDir();
    await plantLock(dir, 'write', { pid: 4242, hostname: 'some-other-host' });
    const lock = new NodeLock(dir);
    const error: unknown = await lock
      .acquire('write', { timeoutMs: 100 })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: 'platform.lock_timeout',
      params: { holder_pid: 4242, holder_hostname: 'some-other-host' },
    });
  });

  it('lets exactly one of two racing processes take over a stale lock', async () => {
    const dir = await tempDir();
    await plantLock(dir, 'write', { pid: deadPid(), hostname: hostname() });
    // 两个“进程”都判断锁已过期以后，才开始接管（让竞争一定发生）。
    let arrived = 0;
    let releaseBarrier: () => void = () => undefined;
    const barrier = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });
    const afterStaleCheck = async () => {
      arrived++;
      if (arrived === 2) releaseBarrier();
      await barrier;
    };
    const reports: StaleLockInfo[] = [];
    const onStaleLock = (info: StaleLockInfo) => reports.push(info);
    const a = new NodeLock(dir, { onStaleLock, hooks: { afterStaleCheck } });
    const b = new NodeLock(dir, { onStaleLock, hooks: { afterStaleCheck } });
    const results = await Promise.allSettled([
      a.acquire('write', { timeoutMs: 500 }),
      b.acquire('write', { timeoutMs: 500 }),
    ]);
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0]?.status === 'rejected' && lost[0].reason).toMatchObject({
      code: 'platform.lock_timeout',
    });
    expect(reports).toHaveLength(1);
    for (const result of won)
      if (result.status === 'fulfilled') await result.value.release();
  });

  it('keeps the heartbeat fresh while the lock is held', async () => {
    const dir = await tempDir();
    const lock = new NodeLock(dir, { heartbeatIntervalMs: 20 });
    const handle = await lock.acquire('write');
    const before = (await stat(join(dir, 'write.lock'))).mtimeMs;
    await sleep(150);
    const after = (await stat(join(dir, 'write.lock'))).mtimeMs;
    expect(after).toBeGreaterThan(before);
    await handle.release();
  });

  it('removes its lock file on release', async () => {
    const dir = await tempDir();
    const handle = await new NodeLock(dir).acquire('write');
    await handle.release();
    expect(await readdir(dir)).toEqual([]);
  });

  it('does not delete a lock that was taken over by someone else', async () => {
    const dir = await tempDir();
    const handle = await new NodeLock(dir).acquire('write');
    // 别的进程认为它过期，接管了这个锁：锁文件被换成了对方的。
    await rm(join(dir, 'write.lock'));
    const other = await plantLock(dir, 'write', {
      pid: 4242,
      hostname: 'some-other-host',
    });
    await handle.release();
    expect((await stat(other)).isFile()).toBe(true);
  });
});

describe('createNodePlatform', () => {
  it('puts lock files under .mastery/runtime/locks of the root', async () => {
    const root = await tempDir();
    const platform = await createNodePlatform({ root });
    const handle = await platform.lock.acquire('write');
    expect(await readdir(join(root, '.mastery', 'runtime', 'locks'))).toEqual([
      'write.lock',
    ]);
    await handle.release();
    expect(platform.ids.ulid()).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    expect(platform.clock.now()).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
    );
  });
});
