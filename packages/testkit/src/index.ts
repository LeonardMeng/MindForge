/// <reference types="vite/client" />
/**
 * @packageDocumentation
 * 测试工具，**只给测试用**（dependency-cruiser 保证只有 `*.test.ts` 能 import 本包）。
 *
 * 把 `fixtures/` 下的示例 Workspace 加载进 `MemoryFileSystem`。文件内容在测试启动时由 Vite 的
 * `import.meta.glob(..., { query: '?raw' })` 读入，不需要 `node:*`。所以本包不 build，
 * 只能在 Vitest 里运行。fixture 里只能放 UTF-8 文本文件。
 */
import { parentPath } from '@mastery/platform';
import {
  MemoryFileSystem,
  type MemoryFileSystemOptions,
} from '@mastery/platform-memory';

/** 相对于本文件的 fixtures 目录。`**\/.*` 单独列出，否则不会包含 `.gitignore` 这类文件。 */
const ROOT = '../../../fixtures/';

const RAW = import.meta.glob<string>(
  ['../../../fixtures/**/*', '../../../fixtures/**/.*'],
  { query: '?raw', import: 'default', eager: true },
);

/** 所有 fixture 的名字（`fixtures/` 下的目录）。 */
export const FIXTURE_NAMES = ['ws-transformers'] as const;
/** fixture 的名字。 */
export type FixtureName = (typeof FIXTURE_NAMES)[number];

/**
 * 某个 fixture 的全部文件：相对于 fixture 根目录的路径 → 文本内容，按路径排序。
 * 每次调用返回新的 Map，修改它不影响其他测试。
 *
 * @param name - fixture 的名字
 */
export function fixtureFiles(name: FixtureName): Map<string, string> {
  if (!(FIXTURE_NAMES as readonly string[]).includes(name)) {
    throw new Error(`unknown fixture "${name}"`);
  }
  const prefix = `${ROOT}${name}/`;
  const entries = Object.entries(RAW)
    .filter(([path]) => path.startsWith(prefix))
    .map(([path, text]) => [path.slice(prefix.length), text] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (entries.length === 0) throw new Error(`fixture "${name}" is empty`);
  return new Map(entries);
}

/**
 * 把一个 fixture 加载进一个**新的、独立的** `MemoryFileSystem`。每次调用都重新创建，
 * 一个测试写入的 Evidence、投影等不会出现在别的测试里。
 *
 * @param name - fixture 的名字
 * @param options - 传给 `MemoryFileSystem` 的选项（比如时钟）
 */
export async function loadFixture(
  name: FixtureName,
  options: MemoryFileSystemOptions = {},
): Promise<MemoryFileSystem> {
  const fs = new MemoryFileSystem(options);
  for (const [path, text] of fixtureFiles(name)) {
    const parent = parentPath(path);
    if (parent !== '') await fs.mkdir(parent, { recursive: true });
    await fs.writeTextFile(path, text);
  }
  return fs;
}
