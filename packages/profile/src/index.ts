/**
 * @packageDocumentation
 * Profile 的端口和领域逻辑（ROADMAP 1.12，ADR-0004）。
 *
 * - {@link ProfileStore}：上层代码访问 Profile 的唯一入口，不知道 Profile 存在哪里。
 * - {@link ProfileBackend}：存储后端的端口，只保存文档和同步。只有 `profile-store-*` 包实现它（不变量 12）。
 * - {@link createProfileStore}：在后端之上执行**全部**领域规则。
 * - 内存实现（测试用）：{@link createMemoryProfileStore}，可以模拟多台设备同步、离线和冲突。
 *
 * 只依赖 `schema`：不依赖 platform、store、git，也不用 `node:*`。
 */
export type {
  BackendDocument,
  BackendIssue,
  BackendSnapshot,
  BackendWrite,
  BackendWriteResult,
  ProfileBackend,
} from './backend.js';
export {
  PROFILE_ERROR_CODES,
  type ProfileError,
  type ProfileErrorCode,
  type ProfileIssue,
} from './errors.js';
export {
  createMemoryProfileStore,
  MemoryProfileBackend,
  MemoryProfileRemote,
  type MemoryProfile,
  type MemoryProfileBackendOptions,
} from './memory.js';
export { crossDocumentIssues } from './rules.js';
export {
  createProfileStore,
  DEFAULT_MAX_ATTEMPTS,
  type ProfileStore,
  type ProfileStoreOptions,
} from './store.js';
export {
  DOCUMENT_KINDS,
  PROFILE_DOCUMENTS,
  type ConceptLink,
  type ConflictChoice,
  type LoadedProfile,
  type Profile,
  type ProfileChange,
  type ProfileDocument,
  type ProfileInit,
  type ProfileResult,
  type RegisteredWorkspace,
  type Revision,
  type SyncResult,
  type SyncStatus,
  type Unwatch,
} from './types.js';
