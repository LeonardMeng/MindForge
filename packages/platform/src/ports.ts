import type { IsoDateTime, Ulid } from '@mastery/schema';

/**
 * 文件系统端口。以一个根目录为准，所有路径都是相对于根目录的路径。
 *
 * 路径规则见 {@link normalizePath}：用 `/` 分隔，不能是绝对路径，不能有 `..`，
 * 统一做 Unicode NFC 规范化，拒绝 Windows 不允许的名字。根目录写作 `''`。
 *
 * 所有方法出错时抛出 {@link PlatformError}，带稳定的错误码（`platform.*`）。
 */
export interface FileSystem {
  /** 读取文件的全部字节。 */
  readFile(path: string): Promise<Uint8Array>;
  /**
   * 读取 UTF-8 文本。字节序标记（BOM）原样保留为 U+FEFF，不做换行符转换，
   * 保证读后再写逐字节不变。不是合法的 UTF-8 时报 `platform.invalid_encoding`。
   */
  readTextFile(path: string): Promise<string>;
  /**
   * **原子地**写入文件（不变量 6）：写入中途崩溃时，目标文件要么是旧内容，要么是新内容，
   * 不会是半截。父目录必须已经存在。
   */
  writeFile(path: string, data: Uint8Array): Promise<void>;
  /** 原子地写入 UTF-8 文本，规则同 {@link FileSystem.writeFile}。 */
  writeTextFile(path: string, text: string): Promise<void>;
  /** 原子地改名或移动文件、目录。目标是已存在的文件时覆盖它。 */
  rename(from: string, to: string): Promise<void>;
  /**
   * 列出目录的直接子项（只列一层），**按名字排序**（按 UTF-16 码元比较），名字是 NFC 形式。
   * 不返回写入中途留下的临时文件。
   */
  list(dir: string): Promise<FileEntry[]>;
  /** 文件或目录的信息；路径不存在时返回 `null`。 */
  stat(path: string): Promise<FileStat | null>;
  /** 删除文件或目录。非空目录必须指定 `recursive: true`。不能删除根目录。 */
  remove(
    path: string,
    options?: { readonly recursive?: boolean },
  ): Promise<void>;
  /** 创建目录。`recursive: true` 时一并创建缺少的父目录，目录已存在也不报错。 */
  mkdir(
    path: string,
    options?: { readonly recursive?: boolean },
  ): Promise<void>;
  /**
   * 监听目录树里的变化，返回取消监听的函数。事件异步送达；
   * 只保证“发生变化后最终至少收到一个关于该路径的事件”，不保证次数。
   */
  watch(dir: string, listener: (event: WatchEvent) => void): Unwatch;
  /**
   * 删除目录树里写入中途留下的临时文件，只删修改时间早于 `olderThanMs` 之前的
   * （默认 10 分钟），避免删掉另一个进程正在写的临时文件。返回删除的路径（排序）。
   */
  cleanupTempFiles(
    dir: string,
    options?: { readonly olderThanMs?: number },
  ): Promise<string[]>;
}

/** 目录里的一项。 */
export interface FileEntry {
  /** 名字（NFC 形式，不含路径）。 */
  readonly name: string;
  readonly kind: 'file' | 'directory';
}

/** 文件或目录的信息。 */
export interface FileStat {
  readonly kind: 'file' | 'directory';
  /** 文件的字节数；目录为 0。 */
  readonly size: number;
  /** 最后修改时间（Unix 毫秒）。只用于判断是否变化，不写进任何数据文件。 */
  readonly modifiedAtMs: number;
}

/** 文件系统的变化。 */
export interface WatchEvent {
  readonly kind: 'created' | 'modified' | 'removed';
  /** 相对于根目录的路径（NFC 形式）。 */
  readonly path: string;
}

/** 取消监听。可以重复调用。 */
export type Unwatch = () => void;

/** 时钟端口。Core 只通过它取得当前时间，保证计算结果可以复现（不变量 3）。 */
export interface Clock {
  /** 当前时间，UTC，精确到秒（ADR-0013）。 */
  now(): IsoDateTime;
}

/** ID 生成端口。 */
export interface IdGenerator {
  /**
   * 生成一个新的 ULID。同一个生成器生成的 ID **严格递增**（按字符串比较），
   * 同一秒内的先后顺序靠它区分（ADR-0013）。
   */
  ulid(): Ulid;
}

/** 锁端口：有名字的互斥锁，可以跨进程（由实现决定）。 */
export interface Lock {
  /**
   * 获取锁。锁被别人持有时等待，超过 `timeoutMs`（默认 30 秒）报 `platform.lock_timeout`。
   * 锁名是一个合法的路径段（规则同 {@link normalizePath}，不能含 `/`）。
   */
  acquire(
    name: string,
    options?: { readonly timeoutMs?: number },
  ): Promise<LockHandle>;
}

/** 持有中的锁。 */
export interface LockHandle {
  /** 释放锁。可以重复调用。 */
  release(): Promise<void>;
}

/** 一个平台提供的全部端口。 */
export interface Platform {
  readonly fs: FileSystem;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly lock: Lock;
}
