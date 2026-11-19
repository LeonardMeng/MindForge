// 把文件协议的 zod schema 导出为 JSON Schema，写到 docs/protocol/schemas/。
//
// 运行：pnpm --filter @mastery/schema gen（先 build，再运行本脚本）。
// 本脚本不属于 schema 的运行时代码，所以可以用 node:*（ADR-0013 只限制 src/）。
// 导入的是构建产物 dist/，因为源码里的 import 写的是 .js 后缀，Node 不能直接运行。
//
// 输出必须稳定：同样的 schema 每次生成的文件逐字节相同。CI 会重新生成并检查有没有差异。
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import * as schema from '../dist/index.js';

const OUT_DIR = join(import.meta.dirname, '../../../docs/protocol/schemas');

/**
 * 要导出的文件 schema 都来自登记表 FILE_KINDS（src/file-kinds.ts），这里不再单独列一遍。
 * 输出文件名是文件种类的名字，title 是文件位置。
 */
const FILES = schema.FILE_KIND_NAMES.map((kind) => {
  const { schema: zodSchema, path, description } = schema.FILE_KINDS[kind];
  return [kind, zodSchema, path, description];
});

/** 每个 schema 生成一个文件：`$schema`、`title`、`description` 在前，其余按 zod 的输出顺序。 */
function render(zodSchema, title, description) {
  const { $schema, ...rest } = z.toJSONSchema(zodSchema, { io: 'output' });
  const json = { $schema, title: `Mastery OS: ${title}`, description, ...rest };
  // 2 个空格缩进，文件末尾有换行。
  return `${JSON.stringify(json, null, 2)}\n`;
}

await mkdir(OUT_DIR, { recursive: true });

const written = new Set();
for (const [name, zodSchema, title, description] of FILES) {
  const file = `${name}.schema.json`;
  await writeFile(join(OUT_DIR, file), render(zodSchema, title, description));
  written.add(file);
}

// 删掉不再生成的旧文件，避免目录里留着过时的 schema。
for (const file of await readdir(OUT_DIR)) {
  if (file.endsWith('.schema.json') && !written.has(file)) {
    await rm(join(OUT_DIR, file));
  }
}
