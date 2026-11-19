import { z } from 'zod';

import { pushIssue } from './errors.js';

/** slug 的格式：小写字母和数字，用单个连字符分隔，不能以连字符开头或结尾。 */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** slug 的最大长度。 */
const SLUG_MAX_LENGTH = 64;
/** ULID 的长度。 */
const ULID_LENGTH = 26;
/** Crockford Base32（大写），不含 I、L、O、U。 */
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
/** 唯一允许的时间写法：UTC，精确到秒，没有毫秒和时区偏移。 */
const ISO_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function isValidSlug(value: string): boolean {
  return value.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(value);
}

/**
 * 结构化文件的格式版本：大于等于 1 的整数。
 *
 * 每个结构化文件都带 `schema_version`（ADR-0005）。
 */
export const SchemaVersion = z.number().check((ctx) => {
  if (!Number.isInteger(ctx.value) || ctx.value < 1) {
    pushIssue(ctx, 'schema_version.invalid', { value: ctx.value });
  }
});
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
    if (/[a-z]/.test(value)) {
      pushIssue(ctx, 'ulid.not_uppercase', { value });
      return;
    }
    if (!ULID_PATTERN.test(value)) {
      pushIssue(ctx, 'ulid.invalid_character', { value });
      return;
    }
    // 第一个字符超过 7 时，48 位时间戳会溢出。
    if (value[0] !== undefined && value[0] > '7') {
      pushIssue(ctx, 'ulid.timestamp_overflow', { value });
    }
  })
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
  .brand<'IsoDateTime'>();
/** 时间戳（UTC，精确到秒）。 */
export type IsoDateTime = z.infer<typeof IsoDateTime>;
