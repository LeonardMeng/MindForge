import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  formatSchemaError,
  formatSchemaIssue,
  SCHEMA_ERROR_CODES,
  Slug,
  toSchemaIssues,
  validate,
} from './index.js';
import { codesOf, issuesOf } from './test-helpers.js';

describe('structured schema errors', () => {
  it('has a message for every error code', () => {
    for (const code of SCHEMA_ERROR_CODES) {
      // 只确认能生成非空的提示，不断言具体措辞。
      expect(
        formatSchemaError(code, { value: 'x', length: 1, max: 1 }).length,
      ).toBeGreaterThan(0);
    }
  });

  it('uses the message table for the zod issue message', () => {
    const result = Slug.safeParse('Bad');
    expect(result.success).toBe(false);
    if (!result.success) {
      const [issue] = toSchemaIssues(result.error);
      expect(issue?.message).toBe(
        formatSchemaError('slug.invalid_format', { value: 'Bad' }),
      );
    }
  });

  it('maps built-in zod errors to field.* codes', () => {
    const result = Slug.safeParse(1);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toSchemaIssues(result.error).map((i) => i.code)).toEqual([
        'field.invalid_type',
      ]);
    }
  });
});

describe('validate()', () => {
  const Shape = z.strictObject({
    name: z.string(),
    tags: z.array(z.string()),
    status: z.enum(['draft', 'active']),
  });

  it('returns the parsed data on success', () => {
    expect(validate(Shape, { name: 'x', tags: [], status: 'draft' })).toEqual({
      success: true,
      data: { name: 'x', tags: [], status: 'draft' },
    });
  });

  it('reports a missing field as field.required', () => {
    expect(issuesOf(Shape, { tags: [], status: 'draft' })).toEqual([
      ['name', 'field.required'],
    ]);
  });

  it('reports a wrong type as field.invalid_type with expected and received', () => {
    const result = validate(Shape, { name: 'x', tags: 'ml', status: 'draft' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toMatchObject([
        {
          code: 'field.invalid_type',
          path: ['tags'],
          params: { expected: 'array', received: 'string' },
        },
      ]);
    }
  });

  it('reports a top-level undefined as field.invalid_type, not field.required', () => {
    expect(codesOf(z.string(), undefined)).toEqual(['field.invalid_type']);
  });

  it('reports each unknown key as its own field.unknown issue', () => {
    expect(
      issuesOf(Shape, { name: 'x', tags: [], status: 'draft', a: 1, b: 2 }),
    ).toEqual([
      ['a', 'field.unknown'],
      ['b', 'field.unknown'],
    ]);
  });

  it('reports a value outside an enum as field.invalid_option', () => {
    const result = validate(Shape, { name: 'x', tags: [], status: 'done' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toMatchObject([
        {
          code: 'field.invalid_option',
          path: ['status'],
          params: { options: ['draft', 'active'] },
        },
      ]);
    }
  });
});

describe('formatSchemaIssue()', () => {
  it('prefixes the message with the field path', () => {
    const result = validate(
      z.strictObject({ prerequisites: z.array(z.string()) }),
      { prerequisites: 'x' },
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const [issue] = result.issues;
      expect(issue).toBeDefined();
      if (issue) {
        expect(formatSchemaIssue(issue)).toBe(
          `prerequisites: ${issue.message}`,
        );
      }
    }
  });

  it('formats array indexes and unusual keys', () => {
    expect(
      formatSchemaIssue({
        code: 'field.required',
        path: ['plugins', '~agent-research', 'items', 2],
        params: {},
        message: 'm',
      }),
    ).toBe('plugins["~agent-research"].items[2]: m');
  });

  it('returns only the message for top-level issues', () => {
    expect(
      formatSchemaIssue({
        code: 'field.required',
        path: [],
        params: {},
        message: 'm',
      }),
    ).toBe('m');
  });
});
