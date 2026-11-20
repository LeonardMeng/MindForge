import type { SchemaIssue } from '@mastery/schema';

type Params = Readonly<Record<string, string | number>>;

const text = (value: string | number | undefined): string =>
  String(value ?? '');

/** store 自己的错误码（英文消息）。schema 的错误码原样转发，见 {@link StoreIssue}。 */
const MESSAGES_EN = {
  'yaml.syntax': (p: Params) =>
    `invalid YAML at line ${text(p.line)}, column ${text(p.column)}: ${text(p.detail)}`,
  'yaml.duplicate_key': (p: Params) =>
    `duplicate key at line ${text(p.line)}; each key may appear only once`,
  'yaml.anchor_not_allowed': (p: Params) =>
    `anchors (&${text(p.anchor)}) are not allowed (line ${text(p.line)}); write the value out`,
  'yaml.alias_not_allowed': (p: Params) =>
    `aliases (*${text(p.alias)}) are not allowed (line ${text(p.line)}); write the value out`,
  'yaml.merge_key_not_allowed': (p: Params) =>
    `the merge key "<<" is not allowed (line ${text(p.line)})`,
  'yaml.tag_not_allowed': (p: Params) =>
    `tags (${text(p.tag)}) are not allowed (line ${text(p.line)})`,
  'yaml.key_not_string': (p: Params) =>
    `keys must be strings (line ${text(p.line)})`,
  'yaml.multiple_documents': () =>
    'a file must contain exactly one YAML document',
  'yaml.directive_not_allowed': (p: Params) =>
    `YAML directives (%${text(p.directive)}) are not allowed`,
  'json.syntax': (p: Params) => `invalid JSON: ${text(p.detail)}`,
  'frontmatter.missing': () =>
    'the file must start with a "---" line followed by YAML frontmatter',
  'frontmatter.unclosed': () =>
    'the YAML frontmatter is not closed by a "---" line',
  'store.invalid_encoding': () => 'the file is not valid UTF-8',
  'store.path_mismatch': (p: Params) =>
    `"${text(p.field)}" is "${text(p.actual)}" but the file location says "${text(p.expected)}"`,
  'store.already_exists': () =>
    'the file already exists; new and append-only files are never overwritten',
  'store.modified_since_read': () =>
    'the file changed on disk since it was read; read it again and reapply the change',
  'store.version_too_new': (p: Params) =>
    `the file was written by a newer version of Mastery OS (schema_version ${text(p.version)}, this version supports ${text(p.latest)}); it is read only`,
  'store.unexpected_file': () => 'unexpected file name in this directory',
  'store.missing_file': () => 'expected file is missing',
} as const satisfies Record<string, (p: Params) => string>;

/** store 自己的错误码。 */
export type StoreErrorCode = keyof typeof MESSAGES_EN;

/** 所有 store 错误码。 */
export const STORE_ERROR_CODES = Object.keys(MESSAGES_EN) as StoreErrorCode[];

/**
 * 读写文件时发现的一个问题：解析错误、校验错误、路径不一致、写入被拒绝等。
 * I/O 错误不在这里，而是抛出 `PlatformError`。
 */
export interface StoreIssue {
  /** 文件相对于 Workspace 根目录的路径。 */
  readonly file: string;
  /** 稳定的错误码：store 自己的（`yaml.*`、`json.*`、`frontmatter.*`、`store.*`）或 schema 的。 */
  readonly code: StoreErrorCode | SchemaIssue['code'];
  /**
   * 文件里出错的位置。字段路径，比如 `['prerequisites', 1]`；Concept 的 frontmatter 字段以
   * `'frontmatter'` 开头；history 的 `.jsonl` 文件以行号（从 0 开始）开头。
   */
  readonly path: readonly (string | number)[];
  /** 生成提示文字用的参数。 */
  readonly params: Readonly<Record<string, unknown>>;
  /** 提示文字（英文，不含文件和字段路径）。 */
  readonly message: string;
}

/** 解析器给出的、还没有文件路径的问题。 */
export interface RawIssue {
  readonly code: StoreErrorCode;
  readonly path: readonly (string | number)[];
  readonly params: Params;
}

/** 构造一条 store 自己的问题。 */
export function storeIssue(
  file: string,
  code: StoreErrorCode,
  params: Params = {},
  path: readonly (string | number)[] = [],
): StoreIssue {
  return { file, code, path, params, message: MESSAGES_EN[code](params) };
}

/** 给解析器的问题加上文件路径。 */
export function fromRawIssue(file: string, issue: RawIssue): StoreIssue {
  return storeIssue(file, issue.code, issue.params, issue.path);
}

/** 给 schema 的问题加上文件路径（和字段路径的前缀）。 */
export function fromSchemaIssue(
  file: string,
  issue: SchemaIssue,
  prefix: readonly (string | number)[] = [],
): StoreIssue {
  return {
    file,
    code: issue.code,
    path: [...prefix, ...issue.path],
    params: issue.params,
    message: issue.message,
  };
}

/**
 * 一条问题的完整提示，比如 `workspace.yaml (plugins.x): ...`。
 *
 * @param issue - 要格式化的问题
 */
export function formatStoreIssue(issue: StoreIssue): string {
  const where =
    issue.path.length === 0 ? '' : ` (${issue.path.map(String).join('.')})`;
  return `${issue.file}${where}: ${issue.message}`;
}
