import { describe, expect, it } from 'vitest';

import {
  formatSchemaError,
  SCHEMA_ERROR_CODES,
  Slug,
  toSchemaIssues,
} from './index.js';

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

  it('prefixes built-in zod codes with "zod."', () => {
    const result = Slug.safeParse(1);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toSchemaIssues(result.error).map((i) => i.code)).toEqual([
        'zod.invalid_type',
      ]);
    }
  });
});
