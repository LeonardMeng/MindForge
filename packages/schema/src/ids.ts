import { z } from 'zod';

import {
  GLOBAL_CONCEPT_REF_PATTERN,
  ISO_DATETIME_PATTERN,
  LOWERCASE_PATTERN,
  patternMeta,
  POSITIVE_INTEGER_META,
  POSITIVE_INTEGER_MIN,
  SLUG_MAX_LENGTH,
  SLUG_PATTERN,
  ULID_CHARACTERS_PATTERN,
  ULID_LENGTH,
  ULID_PATTERN,
} from './constraints.js';
import { pushIssue } from './errors.js';

function isValidSlug(value: string): boolean {
  return value.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(value);
}

/**
 * 结构化文件的格式版本：大于等于 1 的整数。
 *
 * 每个结构化文件都带 `schema_version`（ADR-0005）。
 */
export const SchemaVersion = z
  .number()
  .check((ctx) => {
    if (!Number.isInteger(ctx.value) || ctx.value < POSITIVE_INTEGER_MIN) {
      pushIssue(ctx, 'schema_version.invalid', { value: ctx.value });
    }
  })
  .meta(POSITIVE_INTEGER_META);
/** 结构化文件的格式版本。 */
export type SchemaVersion = z.infer<typeof SchemaVersion>;

/**
 * Concept 和 Workspace 的标识：小写字母、数字和单个连字符，长度 1–64，
 * 不能以连字符开头或结尾，例如 `self-attention`。
 */
export const Slug = z
  .string()
  .check((ctx) => {
    if (!SLUG_PATTERN.test(ctx.value)) {
      pushIssue(ctx, 'slug.invalid_format', { value: ctx.value });
    }
    if (ctx.value.length > SLUG_MAX_LENGTH) {
      pushIssue(ctx, 'slug.too_long', {
        length: ctx.value.length,
        max: SLUG_MAX_LENGTH,
      });
    }
  })
  .meta({ ...patternMeta(SLUG_PATTERN), maxLength: SLUG_MAX_LENGTH })
  .brand<'Slug'>();
/** Concept 和 Workspace 的标识。 */
export type Slug = z.infer<typeof Slug>;

/**
 * 跨 Workspace 的 Concept 引用：`<workspace-id>:<slug>`，例如 `ai:self-attention`。
 * workspace id 和 slug 都遵守 {@link Slug} 的规则。
 */
export const GlobalConceptRef = z
  .string()
  .check((ctx) => {
    const parts = ctx.value.split(':');
    const [workspace, slug] = parts;
    if (parts.length !== 2 || workspace === undefined || slug === undefined) {
      pushIssue(ctx, 'global_concept_ref.invalid_format', { value: ctx.value });
      return;
    }
    if (!isValidSlug(workspace)) {
      pushIssue(ctx, 'global_concept_ref.invalid_workspace', {
        value: ctx.value,
      });
    }
    if (!isValidSlug(slug)) {
      pushIssue(ctx, 'global_concept_ref.invalid_slug', { value: ctx.value });
    }
  })
  .meta(patternMeta(GLOBAL_CONCEPT_REF_PATTERN))
  .brand<'GlobalConceptRef'>();
/** 跨 Workspace 的 Concept 引用。 */
export type GlobalConceptRef = z.infer<typeof GlobalConceptRef>;

/**
 * 把全局引用拆成 workspace id 和 slug。
 *
 * @param ref - 已经通过校验的全局引用
 * @returns `{ workspace, slug }`
 */
export function parseGlobalConceptRef(ref: GlobalConceptRef): {
  workspace: Slug;
  slug: Slug;
} {
  const index = ref.indexOf(':');
  return {
    workspace: ref.slice(0, index) as Slug,
    slug: ref.slice(index + 1) as Slug,
  };
}

/**
 * 用 workspace id 和 slug 组成全局引用。
 *
 * @param workspace - workspace id
 * @param slug - Concept 的 slug
 * @returns `<workspace>:<slug>`
 */
export function formatGlobalConceptRef(
  workspace: Slug,
  slug: Slug,
): GlobalConceptRef {
  return `${workspace}:${slug}` as GlobalConceptRef;
}

/**
 * Evidence、Session、Blindspot、Intervention 等实体的 ID：26 个字符的 ULID，
 * Crockford Base32，**只接受大写**（存储格式）。
 */
export const Ulid = z
  .string()
  .check((ctx) => {
    const value = ctx.value;
    if (value.length !== ULID_LENGTH) {
      pushIssue(ctx, 'ulid.invalid_length', { length: value.length });
      return;
    }
    if (LOWERCASE_PATTERN.test(value)) {
      pushIssue(ctx, 'ulid.not_uppercase', { value });
      return;
    }
    if (!ULID_CHARACTERS_PATTERN.test(value)) {
      pushIssue(ctx, 'ulid.invalid_character', { value });
      return;
    }
    // 第一个字符超过 7 时，48 位时间戳会溢出。
    if (!ULID_PATTERN.test(value)) {
      pushIssue(ctx, 'ulid.timestamp_overflow', { value });
    }
  })
  .meta(patternMeta(ULID_PATTERN))
  .brand<'Ulid'>();
/** 实体 ID（ULID）。 */
export type Ulid = z.infer<typeof Ulid>;

/**
 * 时间戳：UTC，精确到秒，唯一的写法是 `YYYY-MM-DDTHH:mm:ssZ`，例如 `2026-11-19T10:00:00Z`。
 *
 * 不接受毫秒和时区偏移，保证同一个时刻只有一种写法；同一秒内的先后顺序靠 ULID 区分。
 */
export const IsoDateTime = z
  .string()
  .check((ctx) => {
    const value = ctx.value;
    if (!ISO_DATETIME_PATTERN.test(value)) {
      pushIssue(ctx, 'iso_datetime.invalid_format', { value });
      return;
    }
    // 格式正确但日期或时间不存在（如 2 月 30 日、24 点）时，Date 会解析失败或进位，
    // 往返后和原值不一致。
    const date = new Date(value);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString() !== `${value.slice(0, 19)}.000Z`
    ) {
      pushIssue(ctx, 'iso_datetime.invalid_date', { value });
    }
  })
  .meta(patternMeta(ISO_DATETIME_PATTERN))
  .brand<'IsoDateTime'>();
/** 时间戳（UTC，精确到秒）。 */
export type IsoDateTime = z.infer<typeof IsoDateTime>;
