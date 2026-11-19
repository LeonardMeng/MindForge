import { describe, expect, it } from 'vitest';

import {
  MASTERY_STATES,
  MasteryHistoryEntry,
  MasteryProjection,
} from './index.js';
import { codesOf, issuesOf } from './test-helpers.js';

const DIMENSIONS = {
  recall: 0.9,
  understanding: 0.85,
  reasoning: 0.8,
  application: 0.7,
  transfer: null,
};

const PROJECTION = {
  schema_version: 1,
  concept_id: 'self-attention',
  state: 'provisional_mastery',
  dimensions: DIMENSIONS,
  confidence: 0.82,
  rules_version: 1,
  evidence_ids: ['01JD3K8Q8Z6V7X2N4M5P9R0T1W', '01JD5M0A0A0A0A0A0A0A0A0A0A'],
  explanation: [
    {
      code: 'state.provisional_mastery',
      params: { independent_verifications: 1 },
    },
    { code: 'missing.transfer', params: {} },
  ],
};

const ENTRY = {
  schema_version: 1,
  at: '2026-11-19T10:00:00Z',
  state: 'learning',
  dimensions: DIMENSIONS,
  confidence: 0.6,
  rules_version: 1,
  cause: { kind: 'evidence', evidence_id: '01JD3K8Q8Z6V7X2N4M5P9R0T1W' },
};

describe('MASTERY_STATES', () => {
  it('lists the six states in README order', () => {
    expect(MASTERY_STATES).toEqual([
      'not_assessed',
      'diagnosed',
      'learning',
      'provisional_mastery',
      'mastered',
      'needs_review',
    ]);
  });
});

describe('MasteryProjection', () => {
  it('accepts a valid projection', () => {
    expect(codesOf(MasteryProjection, PROJECTION)).toEqual([]);
  });

  it.each(MASTERY_STATES)('accepts state %s', (state) => {
    expect(codesOf(MasteryProjection, { ...PROJECTION, state })).toEqual([]);
  });

  it('rejects an unknown state', () => {
    expect(
      issuesOf(MasteryProjection, { ...PROJECTION, state: 'expert' }),
    ).toEqual([['state', 'field.invalid_option']]);
  });

  it.each([
    'schema_version',
    'concept_id',
    'state',
    'dimensions',
    'confidence',
    'rules_version',
    'evidence_ids',
    'explanation',
  ])('requires %s', (field) => {
    const input: Record<string, unknown> = { ...PROJECTION };
    delete input[field];
    expect(issuesOf(MasteryProjection, input)).toEqual([
      [field, 'field.required'],
    ]);
  });

  it('accepts no evidence and no explanation', () => {
    expect(
      codesOf(MasteryProjection, {
        ...PROJECTION,
        state: 'not_assessed',
        evidence_ids: [],
        explanation: [],
      }),
    ).toEqual([]);
  });

  it('does not carry a computation time (projections must not depend on the clock)', () => {
    expect(
      issuesOf(MasteryProjection, {
        ...PROJECTION,
        computed_at: '2026-11-19T10:00:00Z',
      }),
    ).toEqual([['computed_at', 'field.unknown']]);
  });

  describe('evidence_ids', () => {
    it('must be in ascending order', () => {
      expect(
        issuesOf(MasteryProjection, {
          ...PROJECTION,
          evidence_ids: [
            '01JD5M0A0A0A0A0A0A0A0A0A0A',
            '01JD3K8Q8Z6V7X2N4M5P9R0T1W',
          ],
        }),
      ).toEqual([['evidence_ids.1', 'field.not_sorted']]);
    });

    it('must not repeat', () => {
      expect(
        issuesOf(MasteryProjection, {
          ...PROJECTION,
          evidence_ids: [
            '01JD3K8Q8Z6V7X2N4M5P9R0T1W',
            '01JD3K8Q8Z6V7X2N4M5P9R0T1W',
          ],
        }),
      ).toEqual([['evidence_ids.1', 'field.duplicate_item']]);
    });

    it('must be ULIDs', () => {
      expect(
        issuesOf(MasteryProjection, {
          ...PROJECTION,
          evidence_ids: ['not-a-ulid'],
        }),
      ).toEqual([['evidence_ids.0', 'ulid.invalid_length']]);
    });
  });

  describe('explanation', () => {
    const withExplanation = (explanation: unknown) => ({
      ...PROJECTION,
      explanation,
    });

    it.each(['state.mastered', 'missing_transfer', 'a.b_c.d2'])(
      'accepts the code %s',
      (code) => {
        expect(
          codesOf(MasteryProjection, withExplanation([{ code, params: {} }])),
        ).toEqual([]);
      },
    );

    it.each([
      '',
      'State.Mastered',
      'state..mastered',
      '.state',
      'state.',
      'state mastered',
    ])('rejects the code %j', (code) => {
      expect(
        issuesOf(MasteryProjection, withExplanation([{ code, params: {} }])),
      ).toEqual([['explanation.0.code', 'explanation.invalid_code']]);
    });

    it('requires code and params, and nothing else', () => {
      expect(
        issuesOf(
          MasteryProjection,
          withExplanation([{ code: 'x', text: 'y' }]),
        ),
      ).toEqual([
        ['explanation.0.params', 'field.required'],
        ['explanation.0.text', 'field.unknown'],
      ]);
    });

    it('reports an unknown field in a list item only once', () => {
      expect(
        issuesOf(
          MasteryProjection,
          withExplanation([{ code: 'x', params: {}, text: 'y' }]),
        ),
      ).toEqual([['explanation.0.text', 'field.unknown']]);
    });

    it('rejects params that is not an object', () => {
      expect(
        issuesOf(
          MasteryProjection,
          withExplanation([{ code: 'x', params: [1] }]),
        ),
      ).toEqual([['explanation.0.params', 'field.invalid_type']]);
    });

    it('rejects a plain string explanation', () => {
      expect(
        issuesOf(MasteryProjection, withExplanation('looks good')),
      ).toEqual([['explanation', 'field.expected_list']]);
    });
  });
});

describe('MasteryHistoryEntry', () => {
  it('accepts an entry caused by evidence', () => {
    expect(codesOf(MasteryHistoryEntry, ENTRY)).toEqual([]);
  });

  it.each([{ kind: 'time' }, { kind: 'rules' }])(
    'accepts the cause %j',
    (cause) => {
      expect(
        codesOf(MasteryHistoryEntry, {
          ...ENTRY,
          state: 'needs_review',
          cause,
        }),
      ).toEqual([]);
    },
  );

  it.each([
    'schema_version',
    'at',
    'state',
    'dimensions',
    'confidence',
    'rules_version',
    'cause',
  ])('requires %s', (field) => {
    const input: Record<string, unknown> = { ...ENTRY };
    delete input[field];
    expect(issuesOf(MasteryHistoryEntry, input)).toEqual([
      [field, 'field.required'],
    ]);
  });

  it('requires evidence_id when caused by evidence', () => {
    expect(
      issuesOf(MasteryHistoryEntry, { ...ENTRY, cause: { kind: 'evidence' } }),
    ).toEqual([['cause.evidence_id', 'field.required']]);
  });

  it('rejects extra fields on a time cause', () => {
    expect(
      issuesOf(MasteryHistoryEntry, {
        ...ENTRY,
        cause: { kind: 'time', evidence_id: '01JD3K8Q8Z6V7X2N4M5P9R0T1W' },
      }),
    ).toEqual([['cause.evidence_id', 'field.unknown']]);
  });

  it('rejects an unknown cause', () => {
    expect(
      issuesOf(MasteryHistoryEntry, { ...ENTRY, cause: { kind: 'manual' } }),
    ).toEqual([['cause.kind', 'field.invalid_option']]);
  });
});
