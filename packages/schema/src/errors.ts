import type { z } from 'zod';

/** 把类型名写成提示里用的英文短语。 */
function describeType(type: unknown): string {
  const name = String(type);
  const phrases: Record<string, string> = {
    array: 'an array',
    object: 'an object',
    record: 'an object',
    string: 'a string',
    number: 'a number',
    boolean: 'a boolean',
    null: 'null',
    undefined: 'nothing',
    NaN: 'NaN',
    Infinity: 'an infinite number',
  };
  return phrases[name] ?? name;
}

/** 把可选值列表写成 `"a", "b"`。 */
function listOptions(options: unknown): string {
  return Array.isArray(options)
    ? options.map((option) => JSON.stringify(option)).join(', ')
    : String(options);
}

/** 没有参数的错误码的参数类型。 */
type NoParams = Record<string, never>;

/** 没有参数的消息：参数类型是 {@link NoParams}，函数本身不接收参数。 */
const fixed =
  (text: string): ((params: NoParams) => string) =>
  () =>
    text;

/**
 * 校验错误的消息表（目前只有英文）。
 *
 * 键是稳定的错误码，值根据参数生成提示文字。提示不包含字段路径，路径由
 * {@link formatSchemaIssue} 加在前面。改措辞或增加语言只改这里，错误码和参数保持不变，
 * 测试只断言错误码。
 */
const MESSAGES_EN = {
  // ── 通用字段错误（由 zod 自带的错误映射而来，或由列表、字符串辅助函数产生）──
  'field.required': fixed('is required'),
  'field.invalid_type': (p: { expected: string; received?: string }) =>
    p.received === undefined
      ? `expected ${describeType(p.expected)}`
      : `expected ${describeType(p.expected)}, received ${describeType(p.received)}`,
  'field.unknown': (p: { key: string }) => `"${p.key}" is not a known field`,
  'field.invalid_option': (p: { options: readonly unknown[] }) =>
    `must be one of ${listOptions(p.options)}`,
  'field.invalid': (p: { detail: string; zod_code: string }) =>
    String(p.detail),
  'field.empty': fixed('must not be empty'),
  'field.expected_list': (p: { field: string; value: string }) =>
    `must be a list, for example ${String(p.field)}: [${String(p.value)}]`,
  'field.duplicate_item': (p: { value: unknown }) =>
    `${JSON.stringify(p.value)} appears more than once`,

  // ── 1.1：公共类型和 ID ──
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

  // ── 1.2：Workspace、Concept ──
  'workspace.invalid_plugin_name': (p: { name: string }) =>
    `"${p.name}" is not a valid plugin name: use a slug such as "agent-teacher", ` +
    `optionally prefixed with "~" to disable the plugin`,
  'workspace.plugin_config_null': (p: { name: string }) =>
    `plugin "${p.name}" needs a config object; write "${p.name}: {}" if it has no settings`,
  'workspace.plugin_conflict': (p: { name: string }) =>
    `plugin "${p.name}" is listed as both enabled and disabled`,
  'concept.self_prerequisite': (p: { value: string }) =>
    `"${p.value}" is the concept itself and cannot be its own prerequisite`,
  'concept.unknown_field': (p: { key: string }) =>
    `"${p.key}" is not a Mastery OS field; it is kept as is`,
  'concept_body.missing_section': (p: { section: string }) =>
    `the body has no "## ${p.section}" section`,
  'concept_body.duplicate_section': (p: { section: string }) =>
    `the body has more than one "## ${p.section}" section; only the first one is used`,
  // ── 通用字段错误（1.3 新增）──
  'field.not_positive_integer': (p: { value: number }) =>
    `must be an integer of at least 1, got ${String(p.value)}`,
  'field.out_of_range': (p: { value: number; min: number; max: number }) =>
    `must be between ${String(p.min)} and ${String(p.max)}, got ${String(p.value)}`,
  'field.empty_list': fixed('must not be an empty list'),
  'field.not_sorted': (p: { value: string; previous: string }) =>
    `must be in ascending order; "${String(p.value)}" comes after "${String(p.previous)}"`,

  // ── 1.3：Criteria、Session、Evidence、Mastery ──
  'criteria.no_dimensions': fixed(
    'criteria must assess at least one dimension; write null only for dimensions that are not assessed',
  ),
  'session.score_outside_dimensions': (p: { dimension: string }) =>
    `has a score, but "${String(p.dimension)}" is not one of the dimensions this question tests`,
  'session.completed_before_started': (p: {
    started_at: string;
    completed_at: string;
  }) =>
    `completed_at (${String(p.completed_at)}) is earlier than started_at (${String(p.started_at)})`,
  'evidence.no_dimensions': fixed(
    'at least one dimension must have a score; write null only for dimensions that were not tested',
  ),
  'evidence.note_required': fixed(
    'evidence without a session (session_id: null) needs a note saying where it comes from, ' +
      'for example "final exam: 92/100"',
  ),
  'actor.invalid_model': (p: { value: string }) =>
    `"${p.value}" is not a model reference; expected "<provider>:<model>", for example "ollama:qwen3-14b"`,
  'explanation.invalid_code': (p: { value: string }) =>
    `"${p.value}" is not a valid explanation code; use lowercase letters, digits and underscores, ` +
    `separated by dots (for example "state.mastered")`,

  // ── 1.4：Blindspot、Intervention、Proposal ──
  'blindspot.prerequisite_required': fixed(
    'a blindspot of type "prerequisite" must name the missing prerequisite concept',
  ),
  'blindspot.prerequisite_not_allowed': (p: { type: string }) =>
    `must be null for a blindspot of type "${String(p.type)}"; only type "prerequisite" names a prerequisite`,
  'blindspot.prerequisite_is_self': (p: { value: string }) =>
    `"${p.value}" is the concept itself and cannot be its own missing prerequisite`,
  'intervention.closed_at_required': (p: { status: string }) =>
    `an intervention that is ${String(p.status)} must have closed_at`,
  'intervention.closed_at_not_allowed': fixed(
    'must be null while the intervention is planned',
  ),
  'intervention.closed_before_created': (p: {
    closed_at: string;
    created_at: string;
  }) =>
    `closed_at (${String(p.closed_at)}) is earlier than created_at (${String(p.created_at)})`,
  'proposal.concept_id_mismatch': (p: { concept_id: string; id: string }) =>
    `a concept's id cannot change: the operation targets "${String(p.concept_id)}" ` +
    `but the new frontmatter has id "${String(p.id)}"`,
  'proposal.merge_includes_target': (p: { value: string }) =>
    `"${p.value}" is the merge target and cannot also be a source`,
  'blindspot.merged_into_required': fixed(
    'a merged blindspot must name the blindspot it was merged into',
  ),
  'blindspot.merged_into_not_allowed': (p: { status: string }) =>
    `must be null for a blindspot that is ${String(p.status)}; only merged blindspots have merged_into`,
  'blindspot.merged_into_self': fixed(
    'a blindspot cannot be merged into itself',
  ),

  // ── 1.6：迁移 ──
  'migration.missing_version': fixed(
    'the file has no schema_version; every structured file must have one',
  ),
  'migration.invalid_version': (p: { value: unknown }) =>
    `schema_version must be an integer of at least 1, got ${JSON.stringify(p.value) ?? String(p.value)}`,
  'migration.version_too_new': (p: { version: number; latest: number }) =>
    `this file uses schema_version ${String(p.version)}, but this version of Mastery OS only ` +
    `understands up to ${String(p.latest)}; upgrade Mastery OS to read it (the file is left unchanged)`,
  'migration.no_path': (p: {
    version: number;
    missing_step: number;
    latest: number;
  }) =>
    `there is no migration from schema_version ${String(p.missing_step)} to ` +
    `${String(Number(p.missing_step) + 1)}, so version ${String(p.version)} cannot be upgraded to ${String(p.latest)}`,
  'migration.step_failed': (p: { from: number; to: number; detail: string }) =>
    `migration from schema_version ${String(p.from)} to ${String(p.to)} failed: ${String(p.detail)}`,
} as const;

/** 本包所有错误的错误码。 */
export type SchemaErrorCode = keyof typeof MESSAGES_EN;

/** 每个错误码对应的参数。 */
export type SchemaErrorParams = {
  [C in SchemaErrorCode]: Parameters<(typeof MESSAGES_EN)[C]>[0];
};

/** 所有错误码的列表。 */
export const SCHEMA_ERROR_CODES = Object.keys(
  MESSAGES_EN,
) as readonly SchemaErrorCode[];

/**
 * 根据错误码和参数生成提示文字（不含字段路径）。
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
 * 一条结构化的校验错误或警告。
 *
 * `code` 是稳定的错误码，不随 zod 版本变化：zod 自带的错误会被映射成 `field.*` 错误码。
 */
export interface SchemaIssue {
  /** 稳定的错误码。 */
  readonly code: SchemaErrorCode;
  /** 出错字段的路径，例如 `['prerequisites', 1]`；顶层为空数组。 */
  readonly path: readonly (string | number)[];
  /** 生成提示文字用的参数。 */
  readonly params: Readonly<Record<string, unknown>>;
  /** 提示文字（英文，不含字段路径）。 */
  readonly message: string;
}

/**
 * 构造一条 {@link SchemaIssue}，提示文字从消息表生成。
 *
 * @internal
 */
export function makeIssue<C extends SchemaErrorCode>(
  code: C,
  path: readonly (string | number)[],
  params: SchemaErrorParams[C],
): SchemaIssue {
  return { code, path, params, message: formatSchemaError(code, params) };
}

/** 校验结果：成功时带解析后的数据，失败时带结构化的错误。 */
export type ValidationResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly issues: SchemaIssue[] };

/**
 * 校验输入，失败时返回结构化的错误。**这是推荐的校验入口。**
 *
 * 和直接调用 `schema.safeParse()` 相比，它会让 zod 报告出错的输入值，因此能区分
 * “缺少字段”（`field.required`）和“类型不对”（`field.invalid_type`，参数里带实际类型）。
 *
 * @param schema - 本包导出的任意 schema
 * @param input - 待校验的数据
 * @returns 成功时 `{ success: true, data }`，失败时 `{ success: false, issues }`
 */
export function validate<S extends z.ZodType>(
  schema: S,
  input: unknown,
): ValidationResult<z.output<S>> {
  const result = schema.safeParse(input, { reportInput: true });
  return result.success
    ? { success: true, data: result.data }
    : { success: false, issues: toSchemaIssues(result.error) };
}

/**
 * 把 zod 的校验错误转换成结构化的错误列表。
 *
 * 错误来自 {@link validate} 时信息最完整；来自普通的 `safeParse()` 时，缺少字段会被报告为
 * `field.invalid_type`（没有实际类型），因为 zod 默认不报告输入值。
 *
 * @param error - zod 的校验错误
 * @returns 结构化的错误，顺序和 zod 一致
 */
export function toSchemaIssues(error: z.ZodError): SchemaIssue[] {
  return error.issues.flatMap(mapIssue);
}

/** 把一条 zod issue 映射成一条或多条 {@link SchemaIssue}。 */
function mapIssue(issue: z.core.$ZodIssue): SchemaIssue[] {
  const path = issue.path.map((key) =>
    typeof key === 'symbol' ? String(key) : key,
  );
  const hasInput = 'input' in issue;
  // 有输入值的记录、值为 undefined、且不是顶层：说明对象里缺了这个字段。
  const isMissingField =
    hasInput && issue.input === undefined && path.length > 0;

  if (issue.code === 'custom' && isCustomParams(issue.params)) {
    const { code, ...params } = issue.params;
    return [{ code, path, params, message: issue.message }];
  }
  switch (issue.code) {
    case 'invalid_type':
      if (isMissingField) return [makeIssue('field.required', path, {})];
      return [
        makeIssue(
          'field.invalid_type',
          path,
          hasInput
            ? { expected: issue.expected, received: typeOf(issue.input) }
            : { expected: issue.expected },
        ),
      ];
    case 'invalid_value':
      if (isMissingField) return [makeIssue('field.required', path, {})];
      return [
        makeIssue('field.invalid_option', path, { options: issue.values }),
      ];
    case 'unrecognized_keys':
      return issue.keys.map((key) =>
        makeIssue('field.unknown', [...path, key], { key }),
      );
    default:
      return [
        makeIssue('field.invalid', path, {
          detail: issue.message,
          zod_code: issue.code,
        }),
      ];
  }
}

/** 输入值的类型名，用于 `field.invalid_type` 的 `received` 参数。 */
function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
  if (typeof value === 'number' && !Number.isFinite(value)) return 'Infinity';
  return typeof value;
}

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
 * 一条结构化错误格式化成一行：`<字段路径>: <提示>`，顶层错误只有提示。
 *
 * 路径的写法：`dimensions.recall`、`prerequisites[1]`、`plugins["~agent-research"]`。
 *
 * @param issue - 结构化错误
 * @returns 一行英文提示
 */
export function formatSchemaIssue(issue: SchemaIssue): string {
  const path = formatPath(issue.path);
  return path === '' ? issue.message : `${path}: ${issue.message}`;
}

function formatPath(path: readonly (string | number)[]): string {
  return path
    .map((key, index) => {
      if (typeof key === 'number') return `[${String(key)}]`;
      if (/^[A-Za-z0-9_-]+$/.test(key)) return index === 0 ? key : `.${key}`;
      return `[${JSON.stringify(key)}]`;
    })
    .join('');
}

/**
 * 供本包内部的 `.check()` 使用：按错误码记录一条自定义 issue。
 *
 * @param path - 相对于当前值的路径，比如列表里的下标
 * @internal
 */
export function pushIssue<C extends SchemaErrorCode>(
  ctx: z.core.ParsePayload<unknown>,
  code: C,
  params: SchemaErrorParams[C],
  path: readonly (string | number)[] = [],
): void {
  ctx.issues.push({
    code: 'custom',
    message: formatSchemaError(code, params),
    input: ctx.value,
    params: { code, ...params },
    path: [...path],
  });
}
