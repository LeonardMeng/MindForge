import type { z } from 'zod';

/**
 * 自定义校验错误的消息表（目前只有英文）。
 *
 * 键是稳定的错误码，值根据参数生成提示文字。改措辞或增加语言只改这里，
 * 错误码和参数保持不变，测试只断言错误码。
 */
const MESSAGES_EN = {
  'schema_version.invalid': (p: { value: number }) =>
    `schema_version must be an integer of at least 1, got ${String(p.value)}`,
  'slug.invalid_format': (p: { value: string }) =>
    `"${p.value}" is not a valid slug: use lowercase letters, digits and single hyphens, ` +
    `not starting or ending with a hyphen (for example "self-attention")`,
  'slug.too_long': (p: { length: number; max: number }) =>
    `slug is ${String(p.length)} characters long; the maximum is ${String(p.max)}`,
  'global_concept_ref.invalid_format': (p: { value: string }) =>
    `"${p.value}" is not a global concept reference; expected "<workspace>:<slug>"`,
  'global_concept_ref.invalid_workspace': (p: { value: string }) =>
    `"${p.value}" has an invalid workspace id; workspace ids follow the slug rules`,
  'global_concept_ref.invalid_slug': (p: { value: string }) =>
    `"${p.value}" has an invalid concept slug after the colon`,
  'ulid.invalid_length': (p: { length: number }) =>
    `a ULID has exactly 26 characters, got ${String(p.length)}`,
  'ulid.not_uppercase': (p: { value: string }) =>
    `"${p.value}" contains lowercase letters; ULIDs are stored in uppercase`,
  'ulid.invalid_character': (p: { value: string }) =>
    `"${p.value}" contains characters outside Crockford Base32 (0-9 and A-Z without I, L, O, U)`,
  'ulid.timestamp_overflow': (p: { value: string }) =>
    `"${p.value}" is not a valid ULID: the first character must be 0-7`,
  'iso_datetime.invalid_format': (p: { value: string }) =>
    `"${p.value}" is not a UTC timestamp in the form YYYY-MM-DDTHH:mm:ssZ ` +
    `(no milliseconds, no time zone offset)`,
  'iso_datetime.invalid_date': (p: { value: string }) =>
    `"${p.value}" is not a real date and time`,
  'dimension_score.out_of_range': (p: { value: number }) =>
    `dimension score must be between 0 and 1 (or null if not tested), got ${String(p.value)}`,
} as const;

/** 本包所有自定义错误的错误码。 */
export type SchemaErrorCode = keyof typeof MESSAGES_EN;

/** 每个错误码对应的参数。 */
export type SchemaErrorParams = {
  [C in SchemaErrorCode]: Parameters<(typeof MESSAGES_EN)[C]>[0];
};

/** 所有自定义错误码的列表。 */
export const SCHEMA_ERROR_CODES = Object.keys(
  MESSAGES_EN,
) as readonly SchemaErrorCode[];

/**
 * 根据错误码和参数生成提示文字。
 *
 * @param code - 错误码
 * @param params - 该错误码的参数
 * @returns 英文提示
 */
export function formatSchemaError<C extends SchemaErrorCode>(
  code: C,
  params: SchemaErrorParams[C],
): string {
  const format = MESSAGES_EN[code] as (p: SchemaErrorParams[C]) => string;
  return format(params);
}

/**
 * 一条结构化的校验错误。
 *
 * - 本包的自定义错误：`code` 是 {@link SchemaErrorCode}，`params` 是该错误码的参数。
 * - zod 自带的错误：`code` 是 `zod.<zod 的错误码>`（如 `zod.invalid_type`），
 *   `params` 是 zod issue 里除 code、path、message、input 以外的字段。
 */
export interface SchemaIssue {
  /** 稳定的错误码。 */
  readonly code: SchemaErrorCode | `zod.${string}`;
  /** 出错字段的路径，例如 `['dimensions', 'recall']`；顶层为空数组。 */
  readonly path: readonly (string | number)[];
  /** 生成提示文字用的参数。 */
  readonly params: Readonly<Record<string, unknown>>;
  /** 提示文字（目前只有英文）。 */
  readonly message: string;
}

/**
 * 把 zod 的校验错误转换成结构化的错误列表。
 *
 * @param error - `safeParse` 返回的错误
 * @returns 每个 issue 一条，顺序和 zod 一致
 */
export function toSchemaIssues(error: z.ZodError): SchemaIssue[] {
  return error.issues.map((issue) => {
    const path = issue.path.map((key) =>
      typeof key === 'symbol' ? String(key) : key,
    );
    if (issue.code === 'custom' && isCustomParams(issue.params)) {
      const { code, ...params } = issue.params;
      return { code, path, params, message: issue.message };
    }
    const params = Object.fromEntries(
      Object.entries(issue).filter(([key]) => !ZOD_ISSUE_OWN_FIELDS.has(key)),
    );
    return { code: `zod.${issue.code}`, path, params, message: issue.message };
  });
}

/** zod issue 里不属于 params 的字段。 */
const ZOD_ISSUE_OWN_FIELDS = new Set(['code', 'path', 'message', 'input']);

/** 自定义 issue 的 params：错误码加上该错误码的参数。 */
type CustomParams = { code: SchemaErrorCode } & Record<string, unknown>;

function isCustomParams(params: unknown): params is CustomParams {
  return (
    typeof params === 'object' &&
    params !== null &&
    'code' in params &&
    typeof params.code === 'string' &&
    params.code in MESSAGES_EN
  );
}

/**
 * 供本包内部的 `.check()` 使用：按错误码记录一条自定义 issue。
 *
 * @internal
 */
export function pushIssue<C extends SchemaErrorCode>(
  ctx: z.core.ParsePayload<unknown>,
  code: C,
  params: SchemaErrorParams[C],
): void {
  ctx.issues.push({
    code: 'custom',
    message: formatSchemaError(code, params),
    input: ctx.value,
    params: { code, ...params },
  });
}
