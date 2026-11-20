import type { IsoDateTime } from '@mastery/schema';

import type {
  ConflictChoice,
  ProfileChange,
  ProfileDocument,
  Revision,
  SyncResult,
  SyncStatus,
  Unwatch,
} from './types.js';

/** 后端在解析文档时发现的问题（比如 YAML 语法错误），带稳定的错误码。 */
export interface BackendIssue {
  readonly code: string;
  readonly path: readonly (string | number)[];
  readonly params: Readonly<Record<string, unknown>>;
  readonly message: string;
}

/** 后端读出的一个文档。 */
export type BackendDocument =
  /** 解析成功（还没有按 schema 校验）。 */
  | { readonly status: 'ok'; readonly data: unknown }
  /** 文件不存在。 */
  | { readonly status: 'missing' }
  /** 文件存在但解析不了（编码、YAML 语法、违反“同一个值只有一种写法”等）。 */
  | { readonly status: 'unreadable'; readonly issues: readonly BackendIssue[] };

/** 写入一个文档。 */
export interface BackendWrite {
  readonly document: ProfileDocument;
  readonly data: unknown;
}

/** 后端读出的 Profile：四个文档。 */
export interface BackendSnapshot {
  readonly documents: Readonly<Record<ProfileDocument, BackendDocument>>;
  readonly revision: Revision;
  /** 有未解决冲突的文档。 */
  readonly conflicts: readonly ProfileDocument[];
}

/** {@link ProfileBackend.write} 的结果。 */
export type BackendWriteResult =
  | { readonly ok: true; readonly revision: Revision }
  /** `modified`：当前版本已经不是 `base`；`exists`：创建时 Profile 已经存在。 */
  | { readonly ok: false; readonly reason: 'modified' | 'exists' };

/**
 * Profile 的存储后端（端口）。**只负责保存文档和同步**，不检查任何规则：
 * 规则全部由 {@link createProfileStore} 执行，Git、云等实现不能也不需要自己实现。
 *
 * 只有 `profile-store-*` 包实现这个接口（不变量 12）。实现必须在本地保留完整副本，
 * 离线时读写照常（不变量 11）。
 */
export interface ProfileBackend {
  /**
   * 读出本地的当前内容。**`profile` 文档是 Profile 是否存在的标志**：它不存在时返回 null
   * （即使别的文档还在，比如创建到一半崩溃留下的）。
   */
  read(): Promise<BackendSnapshot | null>;
  /**
   * **按给出的顺序**逐个写入文档。每个文档的写入是原子的；多个文档之间可以不是原子的，
   * 中途崩溃时可能只写了前面几个。`createProfileStore` 会选一个顺序，让每一步之后的 Profile
   * 都满足全部规则，所以中途崩溃总是留下一个合法的 Profile。
   *
   * - `base` 是一个 revision：只有当前版本仍是它时才写入，否则返回 `modified`，什么都不写。
   *   检查版本和全部写入必须是一个整体（比如在同一把锁里），不能被别的进程插进来。
   * - `base` 为 null：创建 Profile。`profile` 文档已存在时返回 `exists`；
   *   其他文档如果已经存在（上次创建到一半留下的），直接覆盖。
   *
   * 写入成功后，用 `source: 'local'` 通知监听者。
   */
  write(
    writes: readonly BackendWrite[],
    base: Revision | null,
  ): Promise<BackendWriteResult>;
  /** 监听变化（只是提示，见 {@link ProfileChange}）。 */
  watch(listener: (change: ProfileChange) => void): Unwatch;
  syncStatus(): Promise<SyncStatus>;
  /**
   * 和远程同步。只有一边改过的文档直接拉取或推送；两边都改过且内容不同的文档成为冲突，
   * 保留本地版本，直到用 {@link ProfileBackend.resolveConflict} 解决。
   *
   * @param at - 同步时间（由 store 提供并校验）
   */
  sync(at: IsoDateTime): Promise<SyncResult>;
  /**
   * 解决一个文档的冲突：`local` 保留本地版本（下次同步时推送），`remote` 换成远程版本。
   * 文档没有冲突时返回 `{ ok: false }`。
   */
  resolveConflict(
    document: ProfileDocument,
    choice: ConflictChoice,
  ): Promise<
    { readonly ok: true; readonly revision: Revision } | { readonly ok: false }
  >;
}
