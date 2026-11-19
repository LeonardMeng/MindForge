/**
 * @packageDocumentation
 * Platform 端口：所有 I/O 都通过这里的接口（ADR-0003）。
 *
 * 本包只包含接口，以及所有实现共用的少量代码（错误类型、路径规则），不用 `node:*`，不做 I/O。
 * 契约测试从子路径 `@mastery/platform/contract` 导出。
 */

export {
  isPlatformError,
  PLATFORM_ERROR_CODES,
  PlatformError,
  type PlatformErrorCode,
  type PlatformErrorParams,
} from './errors.js';
export {
  baseName,
  isTempFileName,
  joinPath,
  normalizeName,
  normalizePath,
  parentPath,
  TEMP_FILE_PREFIX,
} from './paths.js';
export type {
  Clock,
  FileEntry,
  FileStat,
  FileSystem,
  IdGenerator,
  Lock,
  LockHandle,
  Platform,
  Unwatch,
  WatchEvent,
} from './ports.js';
