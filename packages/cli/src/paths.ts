import { existsSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { CliContext } from './context.js';

/**
 * 把用户给的路径变成绝对路径：展开 `~`，相对路径相对于当前目录。
 *
 * @param path - 用户输入的路径
 * @param context - 提供 home 和 cwd
 */
export function resolveUserPath(path: string, context: CliContext): string {
  if (path === '~') return context.home;
  if (path.startsWith('~/') || path.startsWith('~\\')) {
    return join(context.home, path.slice(2));
  }
  return resolve(context.cwd, path);
}

/**
 * 写进 device.yaml 的写法：在 home 目录里的用 `~/…`（分隔符是 `/`），其他的用绝对路径。
 * 同一个位置只有一种写法。
 *
 * @param absolute - 绝对路径
 * @param home - 用户主目录
 */
export function canonicalPath(absolute: string, home: string): string {
  const rest = relative(home, absolute);
  if (rest === '') return '~';
  if (!rest.startsWith('..') && !isAbsolute(rest)) {
    return `~/${rest.split(sep).join('/')}`;
  }
  return absolute;
}

/** 是不是已经存在的目录。 */
export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 从 `dir` 往上找 Git 工作区（有 `.git` 目录或文件的目录）；找不到时返回 null。
 * 不需要 `git` 命令。
 *
 * @param dir - 起点（绝对路径）
 */
export function findGitWorkTree(dir: string): string | null {
  let current = resolve(dir);
  for (;;) {
    if (existsSync(join(current, '.git'))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
