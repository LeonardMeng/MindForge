import {
  baseName,
  isTempFileName,
  joinPath,
  normalizePath,
  parentPath,
  PlatformError,
  TEMP_FILE_PREFIX,
  type Clock,
  type FileEntry,
  type FileStat,
  type FileSystem,
  type Unwatch,
  type WatchEvent,
} from '@mastery/platform';

import { FakeClock } from './clock.js';

/** 默认只清理 10 分钟以前的临时文件。 */
const DEFAULT_TEMP_FILE_AGE_MS = 10 * 60 * 1000;

type Node =
  | {
      readonly kind: 'file';
      readonly data: Uint8Array;
      readonly modifiedAtMs: number;
    }
  | { readonly kind: 'directory'; readonly modifiedAtMs: number };

interface Watcher {
  readonly dir: string;
  readonly listener: (event: WatchEvent) => void;
}

/** 模拟写入中途进程崩溃（见 {@link MemoryFileSystem.crashOnNextWrite}）。 */
export class SimulatedCrashError extends Error {
  override readonly name = 'SimulatedCrashError';

  /** @param path - 正在写入的文件 */
  constructor(readonly path: string) {
    super(`simulated crash while writing "${path}"`);
  }
}

/** {@link MemoryFileSystem} 的选项。 */
export interface MemoryFileSystemOptions {
  /** 提供修改时间的时钟；默认是一个新的 {@link FakeClock}。 */
  readonly clock?: Clock;
}

const encoder = new TextEncoder();

/** 在 Promise 里执行，同步抛出的错误变成 rejection。 */
function run<T>(fn: () => T): Promise<T> {
  return new Promise((resolve) => {
    resolve(fn());
  });
}

/**
 * 内存里的 {@link FileSystem}，测试用。行为和 Node、Tauri 实现一致（同一套契约测试），
 * 另外可以模拟写入中途崩溃。
 *
 * 写入和真实实现一样“先写临时文件，再改名”：崩溃时目标文件保持不变，只留下一个写了一半的临时文件。
 */
export class MemoryFileSystem implements FileSystem {
  readonly #nodes = new Map<string, Node>();
  readonly #watchers = new Set<Watcher>();
  readonly #clock: Clock;
  #crashOnNextWrite = false;
  #tempCounter = 0;

  constructor(options: MemoryFileSystemOptions = {}) {
    this.#clock = options.clock ?? new FakeClock();
    this.#nodes.set('', { kind: 'directory', modifiedAtMs: this.#nowMs() });
  }

  // ── 测试专用 ────────────────────────────────────────────────────────────

  /**
   * 让下一次写入“写到一半崩溃”：只写出一个写了一半的临时文件，目标文件保持不变，
   * 然后抛出 {@link SimulatedCrashError}。只影响下一次写入。
   */
  crashOnNextWrite(): void {
    this.#crashOnNextWrite = true;
  }

  /**
   * 在 `dir` 下留下一个写了一半的临时文件，修改时间是 `ageMs` 毫秒之前。返回它的路径。
   * 契约测试用。
   */
  leaveTempFile(dir: string, ageMs: number): Promise<string> {
    return run(() => {
      const directory = normalizePath(dir);
      this.#requireDirectory(directory);
      const path = this.#tempPath(directory);
      this.#nodes.set(path, {
        kind: 'file',
        data: encoder.encode('half'),
        modifiedAtMs: this.#nowMs() - ageMs,
      });
      return path;
    });
  }

  // ── FileSystem ──────────────────────────────────────────────────────────

  readFile(path: string): Promise<Uint8Array> {
    return run(() => this.#readBytes(normalizePath(path)).slice());
  }

  readTextFile(path: string): Promise<string> {
    return run(() => {
      const normalized = normalizePath(path);
      const bytes = this.#readBytes(normalized);
      try {
        // 不去掉 BOM、遇到非法字节就报错，保证读后再写逐字节不变。
        return new TextDecoder('utf-8', {
          fatal: true,
          ignoreBOM: true,
        }).decode(bytes);
      } catch {
        throw new PlatformError('platform.invalid_encoding', {
          path: normalized,
        });
      }
    });
  }

  writeFile(path: string, data: Uint8Array): Promise<void> {
    return run(() => {
      this.#write(normalizePath(path), data.slice());
    });
  }

  writeTextFile(path: string, text: string): Promise<void> {
    return run(() => {
      this.#write(normalizePath(path), encoder.encode(text));
    });
  }

  rename(from: string, to: string): Promise<void> {
    return run(() => {
      const source = normalizePath(from);
      const target = normalizePath(to);
      if (source === '' || target === '') {
        throw new PlatformError('platform.invalid_path', {
          path: '',
          reason: 'root',
        });
      }
      const node = this.#nodes.get(source);
      if (node === undefined)
        throw new PlatformError('platform.not_found', { path: source });
      this.#requireParentDirectory(target);
      if (source === target) return;
      const existing = this.#nodes.get(target);
      if (node.kind === 'directory') {
        if (target.startsWith(`${source}/`)) {
          throw new PlatformError('platform.invalid_path', {
            path: target,
            reason: 'into_itself',
          });
        }
        if (existing?.kind === 'file') {
          throw new PlatformError('platform.not_a_directory', { path: target });
        }
        if (
          existing?.kind === 'directory' &&
          this.#descendants(target).length > 0
        ) {
          throw new PlatformError('platform.not_empty', { path: target });
        }
      } else if (existing?.kind === 'directory') {
        throw new PlatformError('platform.is_a_directory', { path: target });
      }

      const moved = [source, ...this.#descendants(source)];
      const entries = moved.map(
        (path) => [path, this.#nodes.get(path)] as const,
      );
      for (const path of moved) this.#nodes.delete(path);
      for (const [path, moving] of entries) {
        if (moving === undefined) continue;
        const newPath = target + path.slice(source.length);
        this.#nodes.set(newPath, moving);
      }
      for (const path of moved) this.#emit('removed', path);
      for (const path of moved) {
        const newPath = target + path.slice(source.length);
        this.#emit(
          path === source && existing !== undefined ? 'modified' : 'created',
          newPath,
        );
      }
    });
  }

  list(dir: string): Promise<FileEntry[]> {
    return run(() => {
      const directory = normalizePath(dir);
      this.#requireDirectory(directory);
      const entries: FileEntry[] = [];
      for (const [path, node] of this.#nodes) {
        if (path === '' || parentPath(path) !== directory) continue;
        const name = baseName(path);
        if (isTempFileName(name)) continue;
        entries.push({ name, kind: node.kind });
      }
      return entries.sort((a, b) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
      );
    });
  }

  stat(path: string): Promise<FileStat | null> {
    return run(() => {
      const node = this.#nodes.get(normalizePath(path));
      if (node === undefined) return null;
      return {
        kind: node.kind,
        size: node.kind === 'file' ? node.data.length : 0,
        modifiedAtMs: node.modifiedAtMs,
      };
    });
  }

  remove(
    path: string,
    options: { readonly recursive?: boolean } = {},
  ): Promise<void> {
    return run(() => {
      const normalized = normalizePath(path);
      if (normalized === '') {
        throw new PlatformError('platform.invalid_path', {
          path: '',
          reason: 'root',
        });
      }
      const node = this.#nodes.get(normalized);
      if (node === undefined) {
        throw new PlatformError('platform.not_found', { path: normalized });
      }
      const descendants =
        node.kind === 'directory' ? this.#descendants(normalized) : [];
      if (descendants.length > 0 && options.recursive !== true) {
        throw new PlatformError('platform.not_empty', { path: normalized });
      }
      for (const descendant of descendants) this.#nodes.delete(descendant);
      this.#nodes.delete(normalized);
      for (const removed of [...descendants, normalized])
        this.#emit('removed', removed);
    });
  }

  mkdir(
    path: string,
    options: { readonly recursive?: boolean } = {},
  ): Promise<void> {
    return run(() => {
      const normalized = normalizePath(path);
      const existing = this.#nodes.get(normalized);
      if (existing?.kind === 'file') {
        throw new PlatformError('platform.already_exists', {
          path: normalized,
        });
      }
      if (existing?.kind === 'directory') {
        if (options.recursive === true) return;
        throw new PlatformError('platform.already_exists', {
          path: normalized,
        });
      }
      if (options.recursive !== true) {
        this.#requireParentDirectory(normalized);
        this.#createDirectory(normalized);
        return;
      }
      const segments = normalized.split('/');
      for (let index = 1; index <= segments.length; index++) {
        const prefix = segments.slice(0, index).join('/');
        const node = this.#nodes.get(prefix);
        if (node?.kind === 'file') {
          throw new PlatformError('platform.not_a_directory', { path: prefix });
        }
        if (node === undefined) this.#createDirectory(prefix);
      }
    });
  }

  watch(dir: string, listener: (event: WatchEvent) => void): Unwatch {
    const directory = normalizePath(dir);
    this.#requireDirectory(directory);
    const watcher: Watcher = { dir: directory, listener };
    this.#watchers.add(watcher);
    return () => {
      this.#watchers.delete(watcher);
    };
  }

  cleanupTempFiles(
    dir: string,
    options: { readonly olderThanMs?: number } = {},
  ): Promise<string[]> {
    return run(() => {
      const directory = normalizePath(dir);
      this.#requireDirectory(directory);
      const olderThanMs = options.olderThanMs ?? DEFAULT_TEMP_FILE_AGE_MS;
      const now = this.#nowMs();
      const removed: string[] = [];
      for (const [path, node] of this.#nodes) {
        const inside = directory === '' || path.startsWith(`${directory}/`);
        if (!inside || node.kind !== 'file' || !isTempFileName(baseName(path)))
          continue;
        if (now - node.modifiedAtMs > olderThanMs) removed.push(path);
      }
      for (const path of removed) this.#nodes.delete(path);
      return removed.sort();
    });
  }

  // ── 内部 ────────────────────────────────────────────────────────────────

  #nowMs(): number {
    return Date.parse(this.#clock.now());
  }

  #tempPath(directory: string): string {
    this.#tempCounter++;
    return joinPath(
      directory,
      `${TEMP_FILE_PREFIX}${String(this.#tempCounter)}`,
    );
  }

  #readBytes(path: string): Uint8Array {
    const node = this.#nodes.get(path);
    if (node === undefined)
      throw new PlatformError('platform.not_found', { path });
    if (node.kind === 'directory')
      throw new PlatformError('platform.is_a_directory', { path });
    return node.data;
  }

  /** 先写临时文件，再改名为目标文件。崩溃时只留下写了一半的临时文件。 */
  #write(path: string, data: Uint8Array): void {
    if (path === '')
      throw new PlatformError('platform.is_a_directory', { path });
    this.#requireParentDirectory(path);
    const existing = this.#nodes.get(path);
    if (existing?.kind === 'directory') {
      throw new PlatformError('platform.is_a_directory', { path });
    }
    const temp = this.#tempPath(parentPath(path));
    if (this.#crashOnNextWrite) {
      this.#crashOnNextWrite = false;
      this.#nodes.set(temp, {
        kind: 'file',
        data: data.slice(0, Math.floor(data.length / 2)),
        modifiedAtMs: this.#nowMs(),
      });
      throw new SimulatedCrashError(path);
    }
    this.#nodes.set(path, { kind: 'file', data, modifiedAtMs: this.#nowMs() });
    this.#emit(existing === undefined ? 'created' : 'modified', path);
  }

  #createDirectory(path: string): void {
    this.#nodes.set(path, { kind: 'directory', modifiedAtMs: this.#nowMs() });
    this.#emit('created', path);
  }

  #requireDirectory(path: string): void {
    const node = this.#nodes.get(path);
    if (node === undefined)
      throw new PlatformError('platform.not_found', { path });
    if (node.kind === 'file')
      throw new PlatformError('platform.not_a_directory', { path });
  }

  #requireParentDirectory(path: string): void {
    const parent = parentPath(path);
    const node = this.#nodes.get(parent);
    if (node === undefined)
      throw new PlatformError('platform.not_found', { path: parent });
    if (node.kind === 'file') {
      throw new PlatformError('platform.not_a_directory', { path: parent });
    }
  }

  /** 目录下的所有后代（包括临时文件）。 */
  #descendants(path: string): string[] {
    const prefix = `${path}/`;
    return [...this.#nodes.keys()].filter((key) => key.startsWith(prefix));
  }

  /** 异步通知监听者；临时文件不通知。 */
  #emit(kind: WatchEvent['kind'], path: string): void {
    if (isTempFileName(baseName(path))) return;
    for (const watcher of this.#watchers) {
      if (
        watcher.dir !== '' &&
        path !== watcher.dir &&
        !path.startsWith(`${watcher.dir}/`)
      ) {
        continue;
      }
      queueMicrotask(() => {
        if (this.#watchers.has(watcher)) watcher.listener({ kind, path });
      });
    }
  }
}
