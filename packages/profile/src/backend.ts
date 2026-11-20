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

/** 后端读出的 Profile：四个文档解析后的数据（还没有校验）。 */
export interface BackendSnapshot {
  readonly documents: Readonly<Record<ProfileDocument, unknown>>;
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
  /** 读出本地的当前内容；还没有 Profile 时返回 null。 */
  read(): Promise<BackendSnapshot | null>;
  /**
   * 原子地写入一组文档（只写给出的文档）。
   * - `base` 是一个 revision：只有当前版本仍是它时才写入，否则返回 `modified`，什么都不写。
   * - `base` 为 null：创建 Profile（四个文档都要给出）；已经存在时返回 `exists`。
   * 写入成功后，用 `source: 'local'` 通知监听者。
   */
  write(
    documents: Partial<Record<ProfileDocument, unknown>>,
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
