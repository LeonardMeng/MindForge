import type {
  ConceptLinks,
  FileKind,
  IsoDateTime,
  ProfileConfig,
  ProfileDefaults,
  WorkspaceRegistry,
} from '@mastery/schema';

import type { ProfileError, ProfileIssue } from './errors.js';

/** Profile 由这四个文档组成（Git 实现里是四个 YAML 文件）。 */
export const PROFILE_DOCUMENTS = [
  'profile',
  'workspaces',
  'concept-links',
  'defaults',
] as const;
/** Profile 的一个文档。 */
export type ProfileDocument = (typeof PROFILE_DOCUMENTS)[number];

/** 每个文档对应的文件种类（schema 的 `FILE_KINDS`）。 */
export const DOCUMENT_KINDS = {
  profile: 'profile',
  workspaces: 'workspace-registry',
  'concept-links': 'concept-links',
  defaults: 'profile-defaults',
} as const satisfies Record<ProfileDocument, FileKind>;

/** 整个 Profile。 */
export interface Profile {
  /** `profile.yaml` */
  readonly config: ProfileConfig;
  /** `workspaces.yaml` */
  readonly workspaces: WorkspaceRegistry;
  /** `concept-links.yaml` */
  readonly conceptLinks: ConceptLinks;
  /** `defaults.yaml` */
  readonly defaults: ProfileDefaults;
}

/** 文档名 → {@link Profile} 里的字段。 */
export const PROFILE_FIELDS = {
  profile: 'config',
  workspaces: 'workspaces',
  'concept-links': 'conceptLinks',
  defaults: 'defaults',
} as const satisfies Record<ProfileDocument, keyof Profile>;

/** 已注册的一个 Workspace。 */
export type RegisteredWorkspace = WorkspaceRegistry['workspaces'][number];
/** 一条跨 Workspace 的概念关系。 */
export type ConceptLink = ConceptLinks['links'][number];

/**
 * Profile 的版本标记，由实现决定（内存实现是计数器，Git 实现可以是内容的哈希）。
 * 只用来判断“读取之后有没有被改过”，不能比较大小。
 */
export type Revision = string;

/** 读出的 Profile。 */
export interface LoadedProfile {
  readonly profile: Profile;
  readonly revision: Revision;
  /** 有未解决的同步冲突的文档；读到的是本地版本。 */
  readonly conflicts: readonly ProfileDocument[];
  /**
   * 跨文档的规则已经不满足的地方（比如外部修改、解决冲突之后，某条概念链接指向了已注销的 Workspace）。
   * 读取照常成功；写入不能让问题变多，修复它们的写入总是允许的。
   */
  readonly issues: readonly ProfileIssue[];
}

/** 创建 Profile 时由用户提供的内容；id 由 store 生成。 */
export interface ProfileInit {
  readonly name: string;
  readonly language: string;
  readonly weekly_minutes: number | null;
}

/** 操作的结果：领域规则不允许时返回错误，不抛出。后端的 I/O 错误照常抛出。 */
export type ProfileResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ProfileError };

/** 同步状态。 */
export interface SyncStatus {
  /** 有没有配置远程（Git 远程或云服务）。 */
  readonly remote: 'none' | 'configured';
  /** 现在能不能连上远程。离线时读写照常（不变量 11）。 */
  readonly online: boolean;
  /** 本地改过、还没有同步出去的文档数。 */
  readonly pendingChanges: number;
  /** 最近一次成功同步的时间。 */
  readonly lastSyncedAt: IsoDateTime | null;
  /** 有未解决冲突的文档。 */
  readonly conflicts: readonly ProfileDocument[];
}

/** 一次同步的结果。 */
export interface SyncResult {
  /** `synced`：同步完成（可能产生了冲突）；`offline`：连不上远程；`no_remote`：没有配置远程。 */
  readonly status: 'synced' | 'offline' | 'no_remote';
  /** 从远程拉下来的文档。 */
  readonly pulled: readonly ProfileDocument[];
  /** 推送到远程的文档。 */
  readonly pushed: readonly ProfileDocument[];
  /** 同步之后仍有冲突的文档。 */
  readonly conflicts: readonly ProfileDocument[];
}

/** 解决冲突时选哪一边。 */
export type ConflictChoice = 'local' | 'remote';

/**
 * Profile 变化的通知。**只是提示**：可能合并、可能重复；收到后重新 `load()` 对账。
 * `source`：`local` 是通过这个 store 写的，`external` 是别的程序直接改了文件，`sync` 是同步拉下来的。
 */
export interface ProfileChange {
  readonly document: ProfileDocument;
  readonly source: 'local' | 'external' | 'sync';
}

/** 停止监听；可以调用多次。 */
export type Unwatch = () => void;
