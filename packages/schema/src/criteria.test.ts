import { describe, expect, it } from 'vitest';

import { Criteria } from './index.js';
import { codesOf, issuesOf } from './test-helpers.js';

const VALID = {
  schema_version: 1,
  concept_id: 'self-attention',
  version: 2,
  dimensions: {
    recall: { focus: ['写出注意力公式'], threshold: 0.8 },
    understanding: {
      focus: ['解释 Q、K、V 的作用', '解释为什么要除以 √d'],
      threshold: 0.7,
    },
    reasoning: null,
    application: { focus: ['手算一个 2×2 的例子'], threshold: 0.6 },
    transfer: null,
  },
};

const withDimensions = (dimensions: Record<string, unknown>) => ({
  ...VALID,
  dimensions: { ...VALID.dimensions, ...dimensions },
});

describe('Criteria', () => {
  it('accepts valid criteria', () => {
    expect(codesOf(Criteria, VALID)).toEqual([]);
  });

  it.each(['schema_version', 'concept_id', 'version', 'dimensions'])(
    'requires %s',
    (field) => {
      const input: Record<string, unknown> = { ...VALID };
      delete input[field];
      expect(issuesOf(Criteria, input)).toEqual([[field, 'field.required']]);
    },
  );

  it('requires every dimension to be written (null if not assessed)', () => {
    const dimensions: Record<string, unknown> = { ...VALID.dimensions };
    delete dimensions.reasoning;
    expect(issuesOf(Criteria, { ...VALID, dimensions })).toEqual([
      ['dimensions.reasoning', 'field.required'],
    ]);
  });

  it('rejects criteria that assess no dimension', () => {
    expect(
      issuesOf(Criteria, {
        ...VALID,
        dimensions: {
          recall: null,
          understanding: null,
          reasoning: null,
          application: null,
          transfer: null,
        },
      }),
    ).toEqual([['dimensions', 'criteria.no_dimensions']]);
  });

  it.each([0, 1.5, '2'])('rejects version %j', (version) => {
    const [issue] = issuesOf(Criteria, { ...VALID, version });
    expect(issue?.[0]).toBe('version');
  });

  it('rejects an empty focus list', () => {
    expect(
      issuesOf(
        Criteria,
        withDimensions({ recall: { focus: [], threshold: 0.8 } }),
      ),
    ).toEqual([['dimensions.recall.focus', 'field.empty_list']]);
  });

  it('rejects empty and duplicate focus items', () => {
    expect(
      issuesOf(
        Criteria,
        withDimensions({
          recall: { focus: ['公式', '', '公式'], threshold: 0.8 },
        }),
      ),
    ).toEqual([
      ['dimensions.recall.focus.1', 'field.empty'],
      ['dimensions.recall.focus.2', 'field.duplicate_item'],
    ]);
  });

  it('tells the user to write a single focus as a list', () => {
    expect(
      issuesOf(
        Criteria,
        withDimensions({ recall: { focus: '公式', threshold: 0.8 } }),
      ),
    ).toEqual([['dimensions.recall.focus', 'field.expected_list']]);
  });

  it.each([-0.1, 1.1])('rejects threshold %s', (threshold) => {
    expect(
      issuesOf(
        Criteria,
        withDimensions({ recall: { focus: ['公式'], threshold } }),
      ),
    ).toEqual([['dimensions.recall.threshold', 'field.out_of_range']]);
  });

  it('requires focus and threshold for an assessed dimension', () => {
    expect(issuesOf(Criteria, withDimensions({ recall: {} }))).toEqual([
      ['dimensions.recall.focus', 'field.required'],
      ['dimensions.recall.threshold', 'field.required'],
    ]);
  });

  it('rejects unknown fields at every level', () => {
    expect(
      issuesOf(Criteria, {
        ...withDimensions({
          recall: { focus: ['公式'], threshold: 0.8, weight: 1 },
        }),
        author: 'me',
      }),
    ).toEqual([
      ['dimensions.recall.weight', 'field.unknown'],
      ['author', 'field.unknown'],
    ]);
  });
});
