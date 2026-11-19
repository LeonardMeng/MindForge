import { describe, expect, it } from 'vitest';

import {
  ConceptFrontmatter,
  conceptFrontmatterWarnings,
  validate,
} from './index.js';
import { codesOf, issuesOf } from './test-helpers.js';

/** README 第 7 节 Concept 示例的 frontmatter。 */
const README_EXAMPLE = {
  schema_version: 1,
  id: 'self-attention',
  name: 'Self-Attention',
  prerequisites: ['matrix-multiplication', 'probability'],
  status: 'active',
};

describe('ConceptFrontmatter', () => {
  it('accepts the README example', () => {
    expect(codesOf(ConceptFrontmatter, README_EXAMPLE)).toEqual([]);
  });

  it('accepts no prerequisites written as []', () => {
    expect(
      codesOf(ConceptFrontmatter, { ...README_EXAMPLE, prerequisites: [] }),
    ).toEqual([]);
  });

  it.each(['draft', 'active', 'archived'])('accepts status %s', (status) => {
    expect(codesOf(ConceptFrontmatter, { ...README_EXAMPLE, status })).toEqual(
      [],
    );
  });

  it('accepts Obsidian tags and aliases as lists', () => {
    expect(
      codesOf(ConceptFrontmatter, {
        ...README_EXAMPLE,
        tags: ['ml', 'transformer'],
        aliases: ['自注意力', 'self attention'],
      }),
    ).toEqual([]);
  });

  // ROADMAP 1.2 验收：缺少 id、prerequisites 不是数组等，都要带字段路径。
  it.each(['schema_version', 'id', 'name', 'prerequisites', 'status'])(
    'requires %s',
    (field) => {
      const input: Record<string, unknown> = { ...README_EXAMPLE };
      delete input[field];
      expect(issuesOf(ConceptFrontmatter, input)).toEqual([
        [field, 'field.required'],
      ]);
    },
  );

  it('rejects prerequisites that is not a list', () => {
    expect(
      issuesOf(ConceptFrontmatter, { ...README_EXAMPLE, prerequisites: 42 }),
    ).toEqual([['prerequisites', 'field.invalid_type']]);
  });

  it.each(['tags', 'aliases', 'prerequisites'])(
    'tells the user to write a single %s value as a list',
    (field) => {
      expect(
        issuesOf(ConceptFrontmatter, { ...README_EXAMPLE, [field]: 'ml' }),
      ).toEqual([[field, 'field.expected_list']]);
    },
  );

  it('gives an example of the list form in the message', () => {
    const result = validate(ConceptFrontmatter, {
      ...README_EXAMPLE,
      tags: 'ml',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0]?.params).toEqual({ field: 'tags', value: 'ml' });
      expect(result.issues[0]?.message).toContain('tags: [ml]');
    }
  });

  it('rejects an unknown status', () => {
    expect(
      issuesOf(ConceptFrontmatter, { ...README_EXAMPLE, status: 'mastered' }),
    ).toEqual([['status', 'field.invalid_option']]);
  });

  it('rejects a global reference as a prerequisite (cross-workspace links live in the Profile)', () => {
    expect(
      issuesOf(ConceptFrontmatter, {
        ...README_EXAMPLE,
        prerequisites: ['math:matrix-multiplication'],
      }),
    ).toEqual([['prerequisites.0', 'slug.invalid_format']]);
  });

  it('rejects duplicate prerequisites', () => {
    expect(
      issuesOf(ConceptFrontmatter, {
        ...README_EXAMPLE,
        prerequisites: ['probability', 'probability'],
      }),
    ).toEqual([['prerequisites.1', 'field.duplicate_item']]);
  });

  it('rejects a concept listed as its own prerequisite', () => {
    expect(
      issuesOf(ConceptFrontmatter, {
        ...README_EXAMPLE,
        prerequisites: ['probability', 'self-attention'],
      }),
    ).toEqual([['prerequisites.1', 'concept.self_prerequisite']]);
  });

  it.each(['', '  '])('rejects an empty name %j', (name) => {
    expect(issuesOf(ConceptFrontmatter, { ...README_EXAMPLE, name })).toEqual([
      ['name', 'field.empty'],
    ]);
  });

  it('rejects empty and duplicate tags', () => {
    expect(
      issuesOf(ConceptFrontmatter, {
        ...README_EXAMPLE,
        tags: ['ml', '', 'ml'],
      }),
    ).toEqual([
      ['tags.1', 'field.empty'],
      ['tags.2', 'field.duplicate_item'],
    ]);
  });

  describe('unknown fields', () => {
    const withUnknown = {
      ...README_EXAMPLE,
      cssclasses: ['wide'],
      'obsidian-plugin-field': { a: 1 },
    };

    it('are allowed and kept as they are', () => {
      expect(validate(ConceptFrontmatter, withUnknown)).toEqual({
        success: true,
        data: withUnknown,
      });
    });

    it('produce one concept.unknown_field warning each', () => {
      const frontmatter = ConceptFrontmatter.parse(withUnknown);
      expect(
        conceptFrontmatterWarnings(frontmatter).map((w) => [
          w.path.join('.'),
          w.code,
        ]),
      ).toEqual([
        ['cssclasses', 'concept.unknown_field'],
        ['obsidian-plugin-field', 'concept.unknown_field'],
      ]);
    });

    it('produce no warnings for known fields', () => {
      const frontmatter = ConceptFrontmatter.parse({
        ...README_EXAMPLE,
        tags: ['ml'],
        aliases: ['SA'],
      });
      expect(conceptFrontmatterWarnings(frontmatter)).toEqual([]);
    });
  });
});
