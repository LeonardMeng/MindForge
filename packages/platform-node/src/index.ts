/**
 * @packageDocumentation
 * Platform 端口的 Node 实现：CLI、无界面模式和 MCP 使用（ADR-0003）。
 * 和内存实现、Tauri 实现通过同一套契约测试（`@mastery/platform/contract`）。
 */
import { join } from 'node:path';

import type { Platform } from '@mastery/platform';

import { NodeIdGenerator, SystemClock } from './clock.js';
import { NodeFileSystem } from './file-system.js';
import { NodeLock, type NodeLockOptions } from './lock.js';

export { NodeIdGenerator, SystemClock } from './clock.js';
export { NodeFileSystem, type NodeFileSystemOptions } from './file-system.js';
export { NodeLock, type NodeLockOptions, type StaleLockInfo } from './lock.js';

/** {@link createNodePlatform} 的选项。 */
export interface NodePlatformOptions {
  /** 根目录（比如一个 Workspace）的绝对路径。 */
  readonly root: string;
  /** 存放锁文件的目录，默认 `<root>/.mastery/runtime/locks`。 */
  readonly lockDir?: string;
  /** 锁的选项。 */
  readonly lock?: NodeLockOptions;
}

/**
 * 以一个目录为根，创建一套 Node 平台。
 *
 * @param options - 根目录、锁目录等
 */
export async function createNodePlatform(
  options: NodePlatformOptions,
): Promise<Platform> {
  const fs = await NodeFileSystem.open(options.root);
  const lockDir =
    options.lockDir ?? join(options.root, '.mastery', 'runtime', 'locks');
  return {
    fs,
    clock: new SystemClock(),
    ids: new NodeIdGenerator(),
    lock: new NodeLock(lockDir, options.lock),
  };
}
