/**
 * @packageDocumentation
 * Platform 端口的内存实现，测试用。和 Node、Tauri 实现通过同一套契约测试
 * （`@mastery/platform/contract`），另外可以模拟写入中途崩溃、手动控制时间。
 */
import type { Platform } from '@mastery/platform';

import { FakeClock } from './clock.js';
import { MemoryFileSystem } from './file-system.js';
import { MemoryIdGenerator } from './ids.js';
import { MemoryLockSpace } from './lock.js';

export { FakeClock } from './clock.js';
export {
  MemoryFileSystem,
  SimulatedCrashError,
  type MemoryFileSystemOptions,
} from './file-system.js';
export { MemoryIdGenerator } from './ids.js';
export { MemoryLockSpace } from './lock.js';

/** {@link createMemoryPlatform} 返回的平台：文件系统和时钟带测试专用的方法。 */
export interface MemoryPlatform extends Platform {
  readonly fs: MemoryFileSystem;
  readonly clock: FakeClock;
}

/**
 * 创建一套内存平台：文件系统、ID 生成器都使用同一个假时钟。
 *
 * @param options - `now`：起始时间，格式 `YYYY-MM-DDTHH:mm:ssZ`
 */
export function createMemoryPlatform(
  options: { readonly now?: string } = {},
): MemoryPlatform {
  const clock = new FakeClock(options.now);
  return {
    fs: new MemoryFileSystem({ clock }),
    clock,
    ids: new MemoryIdGenerator(clock),
    lock: new MemoryLockSpace().lock(),
  };
}
