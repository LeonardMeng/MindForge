// 路径的校验和规范化。所有 Platform 实现共用这一份规则，保证内存、Node、Tauri 的行为一致。
// 不用 node:*，不做 I/O。
import { PlatformError } from './errors.js';

/** 原子写入时临时文件名的前缀。`list` 不返回这类文件，普通路径也不能用它开头。 */
export const TEMP_FILE_PREFIX = '.mastery-tmp-';

/** Windows 的盘符路径，比如 `C:/x`、`c:`。 */
const DRIVE_PATTERN = /^[A-Za-z]:/;
/** Windows 不允许出现在文件名里的字符。 */
const RESERVED_CHARACTER_PATTERN = /[<>:"|?*]/;
/** Windows 的保留名，不区分大小写，带扩展名也算（比如 `nul.txt`）。 */
const RESERVED_NAME_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

/** 是否含有控制字符（U+0000–U+001F 和 U+007F）。 */
function hasControlCharacter(segment: string): boolean {
  for (const char of segment) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function invalid(path: unknown, reason: string): PlatformError {
  return new PlatformError('platform.invalid_path', {
    path: String(path),
    reason,
  });
}

/**
 * 校验并规范化一个相对路径。所有 Platform 实现在使用路径之前都要先调用它。
 *
 * - 根目录写作 `''`。
 * - 只用 `/` 作为分隔符：拒绝 `\`、绝对路径（`/x`、`C:/x`）、空段（`a//b`、`a/`）、`.` 和 `..`。
 * - 统一做 Unicode NFC 规范化（macOS 可能以 NFD 存储文件名）。
 * - 拒绝 Windows 不允许的名字：保留名（`CON`、`PRN`、`AUX`、`NUL`、`COM1`–`COM9`、`LPT1`–`LPT9`，
 *   不区分大小写，带扩展名也算）、字符 `<>:"|?*`、控制字符、以点或空格结尾的名字。
 * - 拒绝以临时文件前缀开头的名字（留给原子写入）。
 *
 * 不合法时抛出 `platform.invalid_path`，参数 `reason` 说明原因。
 *
 * @param path - 相对于根目录的路径
 * @returns NFC 形式的路径
 */
export function normalizePath(path: string): string {
  if (typeof path !== 'string') throw invalid(path, 'not_a_string');
  if (path === '') return '';
  if (path.includes('\\')) throw invalid(path, 'backslash');
  if (path.startsWith('/') || DRIVE_PATTERN.test(path))
    throw invalid(path, 'absolute');

  const normalized = path.normalize('NFC');
  for (const segment of normalized.split('/')) {
    if (segment === '') throw invalid(path, 'empty_segment');
    if (segment === '.' || segment === '..') throw invalid(path, 'dot_segment');
    if (hasControlCharacter(segment)) throw invalid(path, 'control_character');
    if (RESERVED_CHARACTER_PATTERN.test(segment)) {
      throw invalid(path, 'reserved_character');
    }
    if (segment.endsWith('.') || segment.endsWith(' ')) {
      throw invalid(path, 'trailing_dot_or_space');
    }
    if (RESERVED_NAME_PATTERN.test(segment))
      throw invalid(path, 'reserved_name');
    if (segment.startsWith(TEMP_FILE_PREFIX))
      throw invalid(path, 'temp_file_name');
  }
  return normalized;
}

/**
 * 校验一个名字（比如锁名）：必须是一个合法的路径段，不能为空，不能含 `/`。
 *
 * @param name - 名字
 * @returns NFC 形式的名字
 */
export function normalizeName(name: string): string {
  const normalized = normalizePath(name);
  if (normalized === '' || normalized.includes('/'))
    throw invalid(name, 'not_a_name');
  return normalized;
}

/** 拼接目录和名字；目录是根目录 `''` 时直接返回名字。 */
export function joinPath(dir: string, name: string): string {
  return dir === '' ? name : `${dir}/${name}`;
}

/** 父目录；顶层的文件和目录的父目录是根目录 `''`。 */
export function parentPath(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

/** 路径的最后一段。 */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** 是不是原子写入留下的临时文件名。 */
export function isTempFileName(name: string): boolean {
  return name.startsWith(TEMP_FILE_PREFIX);
}
