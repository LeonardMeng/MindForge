import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FileSystem, WatchEvent } from '../ports.js';
import { expectPlatformError, expectPlatformErrorSync } from './helpers.js';

/** 契约测试的被测对象：一个空的文件系统，加上只有测试才需要的辅助能力。 */
export interface FileSystemContractSubject {
  /** 被测的文件系统，根目录是空的。 */
  readonly fs: FileSystem;
  /**
   * 在 `dir` 下留下一个“写到一半”的临时文件（模拟崩溃留下的），修改时间是 `ageMs` 毫秒之前。
   * 返回它的路径。实现方式由各平台决定（内存实现模拟崩溃，Node 实现直接写文件并改修改时间）。
   */
  leaveTempFile(dir: string, ageMs: number): Promise<string>;
}

const encoder = new TextEncoder();

/**
 * FileSystem 的契约测试。所有实现（内存、Node、Tauri）都要通过同一套测试。
 *
 * @param name - 实现的名字，用在测试标题里
 * @param create - 每个测试调用一次，返回一个空的文件系统
 */
export function describeFileSystemContract(
  name: string,
  create: () => FileSystemContractSubject | Promise<FileSystemContractSubject>,
): void {
  describe(`FileSystem contract: ${name}`, () => {
    let subject: FileSystemContractSubject;
    let fs: FileSystem;

    beforeEach(async () => {
      subject = await create();
      fs = subject.fs;
    });

    describe('reading and writing', () => {
      it('round-trips text, keeping a BOM, line endings and non-ASCII characters', async () => {
        const text = '\uFEFF# 自注意力\r\nline 2\nrésumé — ✓\n';
        await fs.writeTextFile('a.md', text);
        expect(await fs.readTextFile('a.md')).toBe(text);
        expect(await fs.readFile('a.md')).toEqual(encoder.encode(text));
      });

      it('round-trips bytes', async () => {
        const bytes = new Uint8Array([0, 1, 2, 255, 254, 0]);
        await fs.writeFile('a.bin', bytes);
        expect(await fs.readFile('a.bin')).toEqual(bytes);
      });

      it('replaces the whole content when overwriting', async () => {
        await fs.writeTextFile('a.md', 'a long first version');
        await fs.writeTextFile('a.md', 'short');
        expect(await fs.readTextFile('a.md')).toBe('short');
      });

      it('does not share buffers with the caller', async () => {
        const bytes = new Uint8Array([1, 2, 3]);
        await fs.writeFile('a.bin', bytes);
        bytes[0] = 9;
        const read = await fs.readFile('a.bin');
        read[1] = 9;
        expect(await fs.readFile('a.bin')).toEqual(new Uint8Array([1, 2, 3]));
      });

      it('writes an empty file', async () => {
        await fs.writeTextFile('empty.md', '');
        expect(await fs.readTextFile('empty.md')).toBe('');
        expect(await fs.stat('empty.md')).toMatchObject({
          kind: 'file',
          size: 0,
        });
      });

      it('rejects text that is not valid UTF-8', async () => {
        await fs.writeFile('bad.txt', new Uint8Array([0xff, 0xfe, 0xfd]));
        await expectPlatformError(
          fs.readTextFile('bad.txt'),
          'platform.invalid_encoding',
        );
      });

      it('reports a missing file', async () => {
        await expectPlatformError(
          fs.readFile('missing.md'),
          'platform.not_found',
        );
        await expectPlatformError(
          fs.readTextFile('missing.md'),
          'platform.not_found',
        );
      });

      it('requires the parent directory to exist', async () => {
        await expectPlatformError(
          fs.writeTextFile('a/b.md', 'x'),
          'platform.not_found',
        );
      });

      it('cannot read or write a directory as a file', async () => {
        await fs.mkdir('dir');
        await expectPlatformError(
          fs.readFile('dir'),
          'platform.is_a_directory',
        );
        await expectPlatformError(
          fs.writeTextFile('dir', 'x'),
          'platform.is_a_directory',
        );
      });

      it('cannot write below a file', async () => {
        await fs.writeTextFile('a.md', 'x');
        await expectPlatformError(
          fs.writeTextFile('a.md/b.md', 'x'),
          'platform.not_a_directory',
        );
      });

      it('leaves no temp file behind after a successful write', async () => {
        await fs.mkdir('dir');
        await fs.writeTextFile('dir/a.md', 'x');
        await fs.writeTextFile('dir/a.md', 'y');
        expect(await fs.list('dir')).toEqual([{ name: 'a.md', kind: 'file' }]);
        expect(await fs.cleanupTempFiles('', { olderThanMs: 0 })).toEqual([]);
      });
    });

    describe('stat', () => {
      it('describes files and directories', async () => {
        await fs.mkdir('dir');
        await fs.writeTextFile('dir/a.md', 'hello');
        expect(await fs.stat('dir/a.md')).toMatchObject({
          kind: 'file',
          size: 5,
        });
        expect(await fs.stat('dir')).toMatchObject({
          kind: 'directory',
          size: 0,
        });
        expect(await fs.stat('')).toMatchObject({ kind: 'directory' });
        const stat = await fs.stat('dir/a.md');
        expect(Number.isFinite(stat?.modifiedAtMs)).toBe(true);
      });

      it('counts bytes, not characters', async () => {
        await fs.writeTextFile('a.md', '中');
        expect(await fs.stat('a.md')).toMatchObject({ size: 3 });
      });

      it('returns null for a missing path', async () => {
        expect(await fs.stat('missing')).toBeNull();
        expect(await fs.stat('missing/deeper')).toBeNull();
      });
    });

    describe('list', () => {
      it('lists one level, sorted by name', async () => {
        await fs.mkdir('dir/sub', { recursive: true });
        for (const file of [
          'dir/b.md',
          'dir/a.md',
          'dir/C.md',
          'dir/sub/deep.md',
        ]) {
          await fs.writeTextFile(file, 'x');
        }
        expect(await fs.list('dir')).toEqual([
          { name: 'C.md', kind: 'file' },
          { name: 'a.md', kind: 'file' },
          { name: 'b.md', kind: 'file' },
          { name: 'sub', kind: 'directory' },
        ]);
      });

      it('lists the root', async () => {
        await fs.writeTextFile('workspace.yaml', 'x');
        await fs.mkdir('concepts');
        expect(await fs.list('')).toEqual([
          { name: 'concepts', kind: 'directory' },
          { name: 'workspace.yaml', kind: 'file' },
        ]);
      });

      it('returns names in NFC even when written in NFD', async () => {
        await fs.writeTextFile('re\u0301sume\u0301.md', 'x');
        expect(await fs.list('')).toEqual([
          { name: 'r\u00e9sum\u00e9.md', kind: 'file' },
        ]);
        expect(await fs.readTextFile('r\u00e9sum\u00e9.md')).toBe('x');
      });

      it('does not list temp files', async () => {
        await fs.mkdir('dir');
        await fs.writeTextFile('dir/a.md', 'x');
        await subject.leaveTempFile('dir', 0);
        expect(await fs.list('dir')).toEqual([{ name: 'a.md', kind: 'file' }]);
      });

      it('reports a missing directory and a file', async () => {
        await fs.writeTextFile('a.md', 'x');
        await expectPlatformError(fs.list('missing'), 'platform.not_found');
        await expectPlatformError(fs.list('a.md'), 'platform.not_a_directory');
      });
    });

    describe('mkdir', () => {
      it('creates a directory', async () => {
        await fs.mkdir('dir');
        expect(await fs.stat('dir')).toMatchObject({ kind: 'directory' });
      });

      it('creates missing parents with recursive', async () => {
        await fs.mkdir('a/b/c', { recursive: true });
        expect(await fs.stat('a/b')).toMatchObject({ kind: 'directory' });
        await fs.mkdir('a/b/c', { recursive: true });
      });

      it('requires the parent without recursive', async () => {
        await expectPlatformError(fs.mkdir('a/b'), 'platform.not_found');
      });

      it('reports an existing directory without recursive, and an existing file always', async () => {
        await fs.mkdir('dir');
        await expectPlatformError(fs.mkdir('dir'), 'platform.already_exists');
        await fs.writeTextFile('a.md', 'x');
        await expectPlatformError(fs.mkdir('a.md'), 'platform.already_exists');
        await expectPlatformError(
          fs.mkdir('a.md', { recursive: true }),
          'platform.already_exists',
        );
      });

      it('cannot create a directory below a file', async () => {
        await fs.writeTextFile('a.md', 'x');
        await expectPlatformError(
          fs.mkdir('a.md/b', { recursive: true }),
          'platform.not_a_directory',
        );
      });
    });

    describe('rename', () => {
      it('moves a file', async () => {
        await fs.mkdir('dir');
        await fs.writeTextFile('a.md', 'x');
        await fs.rename('a.md', 'dir/b.md');
        expect(await fs.stat('a.md')).toBeNull();
        expect(await fs.readTextFile('dir/b.md')).toBe('x');
      });

      it('replaces an existing file', async () => {
        await fs.writeTextFile('a.md', 'new');
        await fs.writeTextFile('b.md', 'old');
        await fs.rename('a.md', 'b.md');
        expect(await fs.readTextFile('b.md')).toBe('new');
        expect(await fs.list('')).toEqual([{ name: 'b.md', kind: 'file' }]);
      });

      it('moves a directory with its content', async () => {
        await fs.mkdir('a/sub', { recursive: true });
        await fs.writeTextFile('a/sub/x.md', 'x');
        await fs.rename('a', 'b');
        expect(await fs.stat('a')).toBeNull();
        expect(await fs.readTextFile('b/sub/x.md')).toBe('x');
      });

      it('reports a missing source or target parent', async () => {
        await expectPlatformError(
          fs.rename('missing.md', 'b.md'),
          'platform.not_found',
        );
        await fs.writeTextFile('a.md', 'x');
        await expectPlatformError(
          fs.rename('a.md', 'missing/b.md'),
          'platform.not_found',
        );
        expect(await fs.readTextFile('a.md')).toBe('x');
      });

      it('cannot replace a directory with a file', async () => {
        await fs.writeTextFile('a.md', 'x');
        await fs.mkdir('dir');
        await expectPlatformError(
          fs.rename('a.md', 'dir'),
          'platform.is_a_directory',
        );
      });
    });

    describe('remove', () => {
      it('removes a file and an empty directory', async () => {
        await fs.mkdir('dir');
        await fs.writeTextFile('a.md', 'x');
        await fs.remove('a.md');
        await fs.remove('dir');
        expect(await fs.list('')).toEqual([]);
      });

      it('requires recursive for a non-empty directory', async () => {
        await fs.mkdir('dir/sub', { recursive: true });
        await fs.writeTextFile('dir/sub/a.md', 'x');
        await expectPlatformError(fs.remove('dir'), 'platform.not_empty');
        await fs.remove('dir', { recursive: true });
        expect(await fs.stat('dir')).toBeNull();
      });

      it('reports a missing path', async () => {
        await expectPlatformError(fs.remove('missing'), 'platform.not_found');
      });

      it('cannot remove the root', async () => {
        await expectPlatformError(
          fs.remove('', { recursive: true }),
          'platform.invalid_path',
        );
      });
    });

    describe('cleanupTempFiles', () => {
      const TEN_MINUTES = 10 * 60 * 1000;

      it('removes only temp files older than the threshold (10 minutes by default)', async () => {
        await fs.mkdir('dir/sub', { recursive: true });
        const old = await subject.leaveTempFile(
          'dir/sub',
          TEN_MINUTES + 60_000,
        );
        const fresh = await subject.leaveTempFile('dir', 60_000);
        expect(await fs.cleanupTempFiles('')).toEqual([old]);
        expect(await fs.cleanupTempFiles('', { olderThanMs: 0 })).toEqual([
          fresh,
        ]);
      });

      it('only looks inside the given directory', async () => {
        await fs.mkdir('a');
        await fs.mkdir('b');
        const inB = await subject.leaveTempFile('b', TEN_MINUTES * 2);
        expect(await fs.cleanupTempFiles('a')).toEqual([]);
        expect(await fs.cleanupTempFiles('b')).toEqual([inB]);
      });

      it('does not touch normal files', async () => {
        await fs.writeTextFile('a.md', 'x');
        await fs.cleanupTempFiles('', { olderThanMs: 0 });
        expect(await fs.readTextFile('a.md')).toBe('x');
      });
    });

    describe('watch', () => {
      /** 等到收到关于 path 的 kind 事件。 */
      async function waitForEvent(
        events: WatchEvent[],
        kind: WatchEvent['kind'],
        path: string,
      ) {
        await vi.waitFor(
          () => {
            expect(events).toContainEqual({ kind, path });
          },
          { timeout: 5000, interval: 20 },
        );
      }

      it('reports created, modified and removed files', async () => {
        await fs.mkdir('dir');
        const events: WatchEvent[] = [];
        const unwatch = fs.watch('', (event) => events.push(event));
        try {
          await fs.writeTextFile('dir/a.md', 'x');
          await waitForEvent(events, 'created', 'dir/a.md');
          await fs.writeTextFile('dir/a.md', 'y');
          await waitForEvent(events, 'modified', 'dir/a.md');
          await fs.remove('dir/a.md');
          await waitForEvent(events, 'removed', 'dir/a.md');
        } finally {
          unwatch();
        }
      });

      it('only reports changes inside the watched directory', async () => {
        await fs.mkdir('a');
        await fs.mkdir('b');
        const events: WatchEvent[] = [];
        const unwatch = fs.watch('a', (event) => events.push(event));
        try {
          await fs.writeTextFile('b/outside.md', 'x');
          await fs.writeTextFile('a/inside.md', 'x');
          await waitForEvent(events, 'created', 'a/inside.md');
          expect(events.some((event) => event.path.startsWith('b/'))).toBe(
            false,
          );
        } finally {
          unwatch();
        }
      });

      it('stops reporting after unwatch, and unwatch can be called twice', async () => {
        const events: WatchEvent[] = [];
        const unwatch = fs.watch('', (event) => events.push(event));
        unwatch();
        unwatch();
        await fs.writeTextFile('a.md', 'x');
        // 给事件留出到达的时间（Node 的 fs.watch 比内存实现慢）。
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(events).toEqual([]);
      });

      it('reports a missing directory', () => {
        expectPlatformErrorSync(
          () => fs.watch('missing', () => undefined),
          'platform.not_found',
        );
      });
    });

    describe('invalid paths', () => {
      it.each(['../x', '/abs', 'a\\b', 'a//b', 'CON.md', 'a?.md', 'a.'])(
        'every operation rejects %j',
        async (path) => {
          const code = 'platform.invalid_path';
          await expectPlatformError(fs.readFile(path), code);
          await expectPlatformError(fs.readTextFile(path), code);
          await expectPlatformError(fs.writeFile(path, new Uint8Array()), code);
          await expectPlatformError(fs.writeTextFile(path, ''), code);
          await expectPlatformError(fs.rename(path, 'b.md'), code);
          await expectPlatformError(fs.rename('b.md', path), code);
          await expectPlatformError(fs.list(path), code);
          await expectPlatformError(fs.stat(path), code);
          await expectPlatformError(fs.remove(path), code);
          await expectPlatformError(fs.mkdir(path), code);
          await expectPlatformError(fs.cleanupTempFiles(path), code);
          expectPlatformErrorSync(() => fs.watch(path, () => undefined), code);
        },
      );
    });
  });
}
