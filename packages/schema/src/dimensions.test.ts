import { describe, expect, it } from 'vitest';

import {
  DIMENSIONS,
  DimensionScore,
  DimensionScores,
  toSchemaIssues,
} from './index.js';
import { codesOf } from './test-helpers.js';

/** README 第 7 节 Evidence 示例里的 dimensions。 */
const README_EXAMPLE = {
  recall: 0.9,
  understanding: 0.85,
  reasoning: 0.8,
  application: 0.7,
  transfer: null,
};

const ALL_NULL = {
  recall: null,
  understanding: null,
  reasoning: null,
  application: null,
  transfer: null,
};

describe('DIMENSIONS', () => {
  it('lists the five dimensions in README order', () => {
    expect(DIMENSIONS).toEqual([
      'recall',
      'understanding',
      'reasoning',
      'application',
      'transfer',
    ]);
  });
});

describe('DimensionScore', () => {
  it.each([0, 0.5, 1, null])('accepts %s', (value) => {
    expect(codesOf(DimensionScore, value)).toEqual([]);
  });

  it.each([-0.01, 1.01, -1, 2])('rejects %s as out of range', (value) => {
    expect(codesOf(DimensionScore, value)).toEqual([
      'dimension_score.out_of_range',
    ]);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    '0.5',
    undefined,
  ])('rejects %s as not a number or null', (value) => {
    expect(codesOf(DimensionScore, value)).toEqual(['zod.invalid_type']);
  });
});

describe('DimensionScores', () => {
  it('accepts the README example', () => {
    expect(codesOf(DimensionScores, README_EXAMPLE)).toEqual([]);
  });

  it('accepts all dimensions untested (null)', () => {
    expect(codesOf(DimensionScores, ALL_NULL)).toEqual([]);
  });

  it('keeps 0 (tested, scored zero) and null (not tested) distinct', () => {
    const zero = DimensionScores.parse({ ...ALL_NULL, transfer: 0 });
    const untested = DimensionScores.parse(ALL_NULL);
    expect(zero.transfer).toBe(0);
    expect(untested.transfer).toBeNull();
    expect(zero).not.toEqual(untested);
  });

  it.each(DIMENSIONS)(
    'rejects a missing %s (untested must be written as null)',
    (dimension) => {
      const input: Record<string, unknown> = { ...README_EXAMPLE };
      delete input[dimension];
      const result = DimensionScores.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = toSchemaIssues(result.error);
        expect(issues.map((i) => i.code)).toEqual(['zod.invalid_type']);
        expect(issues[0]?.path).toEqual([dimension]);
      }
    },
  );

  it('rejects unknown dimensions', () => {
    expect(
      codesOf(DimensionScores, { ...README_EXAMPLE, intuition: 0.5 }),
    ).toEqual(['zod.unrecognized_keys']);
  });

  it('reports the path of an out-of-range score', () => {
    const result = DimensionScores.safeParse({
      ...README_EXAMPLE,
      reasoning: 1.5,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = toSchemaIssues(result.error);
      expect(issues.map((i) => i.code)).toEqual([
        'dimension_score.out_of_range',
      ]);
      expect(issues[0]?.path).toEqual(['reasoning']);
    }
  });

  it.each([null, [], 'scores'])('rejects %j as not an object', (value) => {
    expect(codesOf(DimensionScores, value)).toEqual(['zod.invalid_type']);
  });
});
