import { z } from 'zod';

import { makeIssue, pushIssue, type SchemaIssue } from './errors.js';
import { listOf, NonEmptyString, SchemaVersionV1 } from './fields.js';
import { Slug } from './ids.js';

/** Concept 的状态（和掌握状态 MasteryState 是两回事）。 */
export const ConceptStatus = z.enum(['draft', 'active', 'archived']);
/** Concept 的状态。 */
export type ConceptStatus = z.infer<typeof ConceptStatus>;

const CONCEPT_FRONTMATTER_SHAPE = {
  schema_version: SchemaVersionV1,
  /** Concept 的 slug，一旦确定就不再改；改名只改 `name`。 */
  id: Slug,
  name: NonEmptyString,
  /** 本 Workspace 内的前置 Concept；跨 Workspace 的依赖写在 Profile 的 concept-links.yaml。 */
  prerequisites: listOf('prerequisites', Slug),
  status: ConceptStatus,
  /** Obsidian 的标签，只接受列表。 */
  tags: listOf('tags', NonEmptyString).optional(),
  /** Obsidian 的别名，只接受列表。 */
  aliases: listOf('aliases', NonEmptyString).optional(),
};

const KNOWN_FIELDS: ReadonlySet<string> = new Set(
  Object.keys(CONCEPT_FRONTMATTER_SHAPE),
);

/**
 * `concepts/<slug>.md` 的 YAML frontmatter。
 *
 * 为了兼容 Obsidian，**未知字段允许存在并原样保留**（读后再写不能丢），
 * 用 {@link conceptFrontmatterWarnings} 列出它们。这是“对象一律严格校验”的例外。
 */
export const ConceptFrontmatter = z
  .looseObject(CONCEPT_FRONTMATTER_SHAPE)
  .check((ctx) => {
    const index = ctx.value.prerequisites.indexOf(ctx.value.id);
    if (index !== -1) {
      pushIssue(ctx, 'concept.self_prerequisite', { value: ctx.value.id }, [
        'prerequisites',
        index,
      ]);
    }
  });
/** Concept 的 frontmatter（含原样保留的未知字段）。 */
export type ConceptFrontmatter = z.infer<typeof ConceptFrontmatter>;

/**
 * 列出 frontmatter 里 Mastery OS 不认识的字段，每个字段一条 `concept.unknown_field` 警告。
 * `mastery validate` 用它给出警告，但不报错。
 *
 * @param frontmatter - 已经通过校验的 frontmatter
 * @returns 警告列表，按字段出现的顺序
 */
export function conceptFrontmatterWarnings(
  frontmatter: ConceptFrontmatter,
): SchemaIssue[] {
  return Object.keys(frontmatter)
    .filter((key) => !KNOWN_FIELDS.has(key))
    .map((key) => makeIssue('concept.unknown_field', [key], { key }));
}
