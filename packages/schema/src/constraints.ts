// 共用的格式约束。每个正则、每个数值范围只在这里定义一次：
// zod 的 .check() 用它们校验，.meta() 用它们写进导出的 JSON Schema，两边不能各写各的。
// 不从 index.ts 导出。

/** slug 的主体：小写字母和数字，用单个连字符分隔，不能以连字符开头或结尾。 */
const SLUG_BODY = '[a-z0-9]+(?:-[a-z0-9]+)*';

/** Concept 和 Workspace 的标识。 */
export const SLUG_PATTERN = new RegExp(`^${SLUG_BODY}$`);
/** slug 的最大长度。 */
export const SLUG_MAX_LENGTH = 64;

/** 跨 Workspace 的 Concept 引用：`<workspace-id>:<slug>`。 */
export const GLOBAL_CONCEPT_REF_PATTERN = new RegExp(
  `^${SLUG_BODY}:${SLUG_BODY}$`,
);

/** 插件名：slug，前面可以加 `~` 表示禁用。 */
export const PLUGIN_NAME_PATTERN = new RegExp(`^~?${SLUG_BODY}$`);

/** 模型引用：`<provider>:<model>`，provider 是 slug，model 不能有空白。 */
export const MODEL_REF_PATTERN = new RegExp(`^${SLUG_BODY}:\\S+$`);

/** Crockford Base32 的字符（大写），不含 I、L、O、U。 */
const ULID_ALPHABET = '0-9A-HJKMNP-TV-Z';
/** ULID 的长度。 */
export const ULID_LENGTH = 26;
/** 第一个字符的上限：超过 7 时 48 位时间戳会溢出。 */
export const ULID_MAX_FIRST_CHARACTER = '7';
/** 完整的 ULID 存储格式：只接受大写，第一个字符 0–7。 */
export const ULID_PATTERN = new RegExp(
  `^[0-${ULID_MAX_FIRST_CHARACTER}][${ULID_ALPHABET}]{${String(ULID_LENGTH - 1)}}$`,
);
/** 只用于给出更具体的错误：是否全部是 Crockford Base32 字符。 */
export const ULID_CHARACTERS_PATTERN = new RegExp(`^[${ULID_ALPHABET}]*$`);
/** 只用于给出更具体的错误：是否含有小写字母。 */
export const LOWERCASE_PATTERN = /[a-z]/;

/** 唯一允许的时间写法：UTC，精确到秒，没有毫秒和时区偏移。日期是否真实存在另外检查。 */
export const ISO_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** 至少含有一个非空白字符（不能为空、也不能只有空白）。 */
export const NON_BLANK_PATTERN = /\S/;

/** explanation 的 code：小写字母、数字、下划线，用点分段。 */
export const EXPLANATION_CODE_PATTERN = /^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/;

/** `0..1` 的范围：维度得分、置信度、阈值。 */
export const UNIT_INTERVAL = { min: 0, max: 1 } as const;

/** 正整数的下限：schema_version、criteria 版本、规则版本。 */
export const POSITIVE_INTEGER_MIN = 1;

/** 写进 JSON Schema 的 pattern（ECMAScript 正则，和 JSON Schema 的方言一致）。 */
export function patternMeta(pattern: RegExp): { pattern: string } {
  return { pattern: pattern.source };
}

/** 写进 JSON Schema 的 `0..1` 范围。 */
export const UNIT_INTERVAL_META = {
  minimum: UNIT_INTERVAL.min,
  maximum: UNIT_INTERVAL.max,
} as const;

/** 写进 JSON Schema 的正整数。 */
export const POSITIVE_INTEGER_META = {
  type: 'integer',
  minimum: POSITIVE_INTEGER_MIN,
} as const;
