import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { createRulesRegistry, type CoreError, type Ports } from '@mastery/core';
import { createStoreRepository } from '@mastery/core-store';
import type { Clock, IdGenerator } from '@mastery/platform';
import {
  NodeFileSystem,
  NodeIdGenerator,
  SystemClock,
} from '@mastery/platform-node';
import { rulesV1 } from '@mastery/rules-v1';
import { createStore, type Store } from '@mastery/store';

import type { CliContext } from './context.js';
import { resolveUserPath } from './paths.js';
import { CommandError } from './commands/profile.js';

/** 打开的 Workspace：根目录、store 和 Core 的端口。 */
export interface OpenWorkspace {
  readonly root: string;
  readonly store: Store;
  readonly ports: Ports;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/**
 * 找 Workspace 的根目录：给了 `--workspace` 时用它（必须有 `workspace.yaml`）；没给时从当前目录
 * 往上找第一个有 `workspace.yaml` 的目录（和 `git` 找仓库一样）。
 *
 * @param context - 运行环境
 * @param option - `--workspace` 的值
 */
export function findWorkspaceRoot(
  context: CliContext,
  option: string | undefined,
): string {
  if (option !== undefined) {
    const root = resolveUserPath(option, context);
    if (!existsSync(join(root, 'workspace.yaml'))) {
      throw new CommandError(
        `${root} is not a workspace (it has no workspace.yaml)`,
      );
    }
    return root;
  }
  let current = resolve(context.cwd);
  for (;;) {
    if (existsSync(join(current, 'workspace.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) {
      throw new CommandError(
        `no workspace found in ${context.cwd} or any folder above it; ` +
          'run the command inside a workspace or pass --workspace <dir>',
      );
    }
    current = parent;
  }
}

/**
 * 打开 Workspace 并组装 Core 的端口（2.8）：store 上的 Repository、系统时钟、规则 v1；
 * 事件没有监听者，监听者的错误写到标准错误。
 *
 * @param context - 运行环境
 * @param option - `--workspace` 的值
 */
export async function openWorkspace(
  context: CliContext,
  option: string | undefined,
): Promise<OpenWorkspace> {
  const root = findWorkspaceRoot(context, option);
  const store = createStore(await NodeFileSystem.open(root));
  const clock = context.clock ?? new SystemClock();
  const ids = context.ids ?? new NodeIdGenerator();
  const ports: Ports = {
    repository: createStoreRepository(store),
    clock,
    events: {
      emit: () => undefined,
      reportError: (error) =>
        context.stderr.write(
          `mastery: an event listener failed: ${error instanceof Error ? error.message : String(error)}\n`,
        ),
    },
    rules: createRulesRegistry([rulesV1]),
  };
  return { root, store, ports, clock, ids };
}

/** 一个领域错误的文字：错误码、消息和每个文件问题。 */
export function formatCoreError(error: CoreError): string {
  const lines = [`${error.code}: ${error.message}`];
  for (const issue of error.issues) {
    const where =
      issue.path.length === 0 ? '' : ` (${issue.path.map(String).join('.')})`;
    lines.push(`  ${issue.file}${where}: ${issue.message}`);
  }
  return `${lines.join('\n')}\n`;
}

/** 维度分数的显示：两位小数；`null`（没测过）显示成 `—`，和 `0.00` 区分开（不变量 5）。 */
export function formatScore(value: number | null): string {
  return value === null ? '—' : value.toFixed(2);
}

/** 简单的文字表格：每列按最宽的单元格对齐，列之间两个空格。 */
export function table(rows: readonly (readonly string[])[]): string {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, [...cell].length);
    });
  }
  return rows
    .map((row) =>
      row
        .map((cell, i) =>
          i === row.length - 1
            ? cell
            : cell + ' '.repeat((widths[i] ?? 0) - [...cell].length),
        )
        .join('  ')
        .trimEnd(),
    )
    .map((line) => `${line}\n`)
    .join('');
}
