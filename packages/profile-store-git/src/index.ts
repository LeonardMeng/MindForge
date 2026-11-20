/**
 * @packageDocumentation
 * ProfileStore 的 Git 实现（ROADMAP 1.13）。现在只做文件读写：`ProfileBackend` 的实现，
 * 规则全部由 `@mastery/profile` 的 `createProfileStore` 执行。Git 提交在 3.6 之后接入，
 * 远程同步在 8.1。
 */
export {
  createGitProfileBackend,
  createGitProfileStore,
  PROFILE_FILES,
  PROFILE_WRITE_LOCK,
  profileRevision,
  type GitProfileBackendOptions,
} from './backend.js';
