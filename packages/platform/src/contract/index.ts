/**
 * @packageDocumentation
 * Platform 端口的契约测试（`@mastery/platform/contract`）。所有实现（内存、Node、Tauri）
 * 都调用这里的函数跑同一套测试。依赖 vitest（可选的 peerDependency），只在测试里使用。
 */

export {
  describeFileSystemContract,
  type FileSystemContractSubject,
} from './file-system.js';
export {
  describeClockContract,
  describeIdGeneratorContract,
  describeLockContract,
  type LockContractSubject,
} from './others.js';
export { expectPlatformError, expectPlatformErrorSync } from './helpers.js';
