// 本包内部共用的字段辅助函数，不从 index.ts 导出。
import { z } from 'zod';

import { pushIssue } from './errors.js';

/** 不能为空（也不能只有空白）的字符串。 */
export const NonEmptyString = z.string().check((ctx) => {
  if (ctx.value.trim() === '') {
    pushIssue(ctx, 'field.empty', {});
  }
});

/** 当前（也是唯一）支持的文件格式版本。读取旧版本文件要先经过迁移（1.6）。 */
export const SchemaVersionV1 = z.literal(1);

/** 大于等于 1 的整数，用于 criteria 版本、规则版本等。 */
export const PositiveInteger = z.number().check((ctx) => {
  if (!Number.isInteger(ctx.value) || ctx.value < 1) {
    pushIssue(ctx, 'field.not_positive_integer', { value: ctx.value });
  }
});

/** `0..1` 的有限数，用于置信度、阈值等。 */
export const UnitInterval = z.number().check((ctx) => {
  if (ctx.value < 0 || ctx.value > 1) {
    pushIssue(ctx, 'field.out_of_range', { value: ctx.value, min: 0, max: 1 });
  }
});

/** 是不是普通对象（不是 null，也不是数组）。 */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 输入值的类型名，用于 `field.invalid_type` 的 `received` 参数。 */
function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * 把另一个 schema 的校验错误转交给当前的 ctx，路径前面加上 prefix。
 *
 * 多余字段（`unrecognized_keys`）直接换成 `field.unknown`：zod 的 pipe 遇到
 * `unrecognized_keys` 不会停下，后面的 schema 会把同一个多余字段再报一次；
 * 自定义错误则会让 pipe 停下。
 */
function forwardIssues(
  ctx: z.core.ParsePayload<unknown>,
  issues: readonly z.core.$ZodIssue[],
  prefix: readonly (string | number)[],
): void {
  for (const issue of issues) {
    if (issue.code === 'unrecognized_keys') {
      const path = issue.path.map((key) =>
        typeof key === 'symbol' ? String(key) : key,
      );
      for (const key of issue.keys) {
        pushIssue(ctx, 'field.unknown', { key }, [...prefix, ...path, key]);
      }
      continue;
    }
    // zod 的 issue 和 raw issue 类型不完全一致，需要断言。
    ctx.issues.push({
      ...issue,
      path: [...prefix, ...issue.path],
    } as z.core.$ZodRawIssue);
  }
}

/** {@link listOf} 的选项。 */
interface ListOptions {
  /** 不能是空列表（默认 false）。 */
  readonly nonEmpty?: boolean;
  /** 不能有重复项（默认 true）。 */
  readonly unique?: boolean;
}

/**
 * 列表字段：每一项都按 `item` 校验，默认不能有重复项。
 *
 * - 写成单个字符串时（比如 `tags: ml`），报 `field.expected_list`，提示改成 `tags: [ml]`。
 * - 元素的错误和重复项会同时报出（zod 在元素出错时不会再运行数组级的检查，所以这里自己逐个校验）。
 *
 * @param field - 字段名，用在提示的示例里
 * @param item - 每一项的 schema
 * @param options - 是否允许空列表、是否允许重复
 */
export function listOf<T extends z.ZodType>(
  field: string,
  item: T,
  options: ListOptions = {},
) {
  const { nonEmpty = false, unique = true } = options;
  return z
    .unknown()
    .check((ctx) => {
      const value = ctx.value;
      if (typeof value === 'string') {
        pushIssue(ctx, 'field.expected_list', { field, value });
        return;
      }
      // 不是数组时交给后面的 z.array 报 field.invalid_type 或 field.required。
      if (!Array.isArray(value)) return;
      if (nonEmpty && value.length === 0) {
        pushIssue(ctx, 'field.empty_list', {});
        return;
      }
      const seen = new Set<string>();
      value.forEach((element: unknown, index) => {
        const result = item.safeParse(element, { reportInput: true });
        if (!result.success) {
          forwardIssues(ctx, result.error.issues, [index]);
          return;
        }
        if (!unique) return;
        const key = JSON.stringify(element);
        if (seen.has(key)) {
          pushIssue(ctx, 'field.duplicate_item', { value: element }, [index]);
        } else {
          seen.add(key);
        }
      });
    })
    .pipe(z.array(item));
}

/**
 * 按 `kind` 字段区分的对象，例如 `evaluator: { kind: agent, … } | { kind: human }`。
 *
 * 不直接用 `z.discriminatedUnion`：它在分支内部不报告输入值，缺少字段时只能报成
 * `field.invalid_type`。这里自己按 `kind` 分发，`kind` 缺失报 `field.required`，
 * 取值不对报 `field.invalid_option`，分支内的错误原样转交。
 *
 * @param variants - `kind` 的每个取值对应的 schema
 * @param union - 同样这些分支组成的 `z.discriminatedUnion`，用于推导类型
 */
export function taggedUnion<U extends z.ZodType>(
  variants: Readonly<Record<string, z.ZodType>>,
  union: U,
) {
  const kinds = Object.keys(variants);
  return z
    .unknown()
    .check((ctx) => {
      const value = ctx.value;
      if (value === undefined) {
        pushIssue(ctx, 'field.required', {});
        return;
      }
      if (!isPlainObject(value)) {
        pushIssue(ctx, 'field.invalid_type', {
          expected: 'object',
          received: typeName(value),
        });
        return;
      }
      if (value.kind === undefined) {
        pushIssue(ctx, 'field.required', {}, ['kind']);
        return;
      }
      const variant =
        typeof value.kind === 'string' ? variants[value.kind] : undefined;
      if (variant === undefined) {
        pushIssue(ctx, 'field.invalid_option', { options: kinds }, ['kind']);
        return;
      }
      const result = variant.safeParse(value, { reportInput: true });
      if (!result.success) forwardIssues(ctx, result.error.issues, []);
    })
    .pipe(union);
}
