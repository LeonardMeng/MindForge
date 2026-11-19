import { describe, expect, it } from 'vitest';

import { Blindspot } from './index.js';
import { codesOf, issuesOf } from './test-helpers.js';

const VALID = {
  schema_version: 1,
  id: '01JD6B0A0A0A0A0A0A0A0A0A0A',
  concept_id: 'self-attention',
  type: 'application',
  status: 'suspected',
  description: '能写出公式，但遇到没见过的例子就不会用。',
  prerequisite_id: null,
  merged_into: null,
  evidence_ids: ['01JD3K8Q8Z6V7X2N4M5P9R0T1W'],
  source: { kind: 'agent', id: 'agent-diagnoser', model: 'ollama:qwen3-14b' },
  created_at: '2026-11-20T08:00:00Z',
};

describe('Blindspot', () => {
  it('accepts a valid blindspot', () => {
    expect(codesOf(Blindspot, VALID)).toEqual([]);
  });

  it.each(['knowledge', 'reasoning', 'application', 'retention'])(
    'accepts type %s without a prerequisite',
    (type) => {
      expect(codesOf(Blindspot, { ...VALID, type })).toEqual([]);
    },
  );

  it('accepts type prerequisite with the prerequisite concept', () => {
    expect(
      codesOf(Blindspot, {
        ...VALID,
        type: 'prerequisite',
        prerequisite_id: 'matrix-multiplication',
      }),
    ).toEqual([]);
  });

  it.each(['suspected', 'confirmed', 'resolved'])(
    'accepts status %s',
    (status) => {
      expect(codesOf(Blindspot, { ...VALID, status })).toEqual([]);
    },
  );

  it('accepts a blindspot recorded by hand without evidence', () => {
    expect(
      codesOf(Blindspot, {
        ...VALID,
        evidence_ids: [],
        source: { kind: 'human' },
      }),
    ).toEqual([]);
  });

  it.each([
    'schema_version',
    'id',
    'concept_id',
    'type',
    'status',
    'description',
    'prerequisite_id',
    'merged_into',
    'evidence_ids',
    'source',
    'created_at',
  ])(
    'requires %s (prerequisite_id and merged_into must be written even when null)',
    (field) => {
      const input: Record<string, unknown> = { ...VALID };
      delete input[field];
      expect(issuesOf(Blindspot, input)).toEqual([[field, 'field.required']]);
    },
  );

  it.each([
    ['type', 'misconception'],
    ['status', 'deleted'],
  ])('rejects %s %j', (field, value) => {
    expect(issuesOf(Blindspot, { ...VALID, [field]: value })).toEqual([
      [field, 'field.invalid_option'],
    ]);
  });

  describe('merged_into', () => {
    const MERGED = {
      ...VALID,
      status: 'merged',
      merged_into: '01JD6B9A0A0A0A0A0A0A0A0A0A',
    };

    it('accepts a merged blindspot pointing at the one it was merged into', () => {
      expect(codesOf(Blindspot, MERGED)).toEqual([]);
    });

    it('is required when merged', () => {
      expect(issuesOf(Blindspot, { ...MERGED, merged_into: null })).toEqual([
        ['merged_into', 'blindspot.merged_into_required'],
      ]);
    });

    it.each(['suspected', 'confirmed', 'resolved'])(
      'must be null when %s',
      (status) => {
        expect(issuesOf(Blindspot, { ...MERGED, status })).toEqual([
          ['merged_into', 'blindspot.merged_into_not_allowed'],
        ]);
      },
    );

    it('cannot point at the blindspot itself', () => {
      expect(issuesOf(Blindspot, { ...MERGED, merged_into: VALID.id })).toEqual(
        [['merged_into', 'blindspot.merged_into_self']],
      );
    });

    it('must be a ULID', () => {
      expect(issuesOf(Blindspot, { ...MERGED, merged_into: 'other' })).toEqual([
        ['merged_into', 'ulid.invalid_length'],
      ]);
    });
  });

  describe('prerequisite_id', () => {
    it('is required for type prerequisite', () => {
      expect(issuesOf(Blindspot, { ...VALID, type: 'prerequisite' })).toEqual([
        ['prerequisite_id', 'blindspot.prerequisite_required'],
      ]);
    });

    it('must be null for other types', () => {
      expect(
        issuesOf(Blindspot, {
          ...VALID,
          prerequisite_id: 'matrix-multiplication',
        }),
      ).toEqual([['prerequisite_id', 'blindspot.prerequisite_not_allowed']]);
    });

    it('cannot be the concept itself', () => {
      expect(
        issuesOf(Blindspot, {
          ...VALID,
          type: 'prerequisite',
          prerequisite_id: 'self-attention',
        }),
      ).toEqual([['prerequisite_id', 'blindspot.prerequisite_is_self']]);
    });

    it('must be a local slug', () => {
      expect(
        issuesOf(Blindspot, {
          ...VALID,
          type: 'prerequisite',
          prerequisite_id: 'math:matrix-multiplication',
        }),
      ).toEqual([['prerequisite_id', 'slug.invalid_format']]);
    });
  });

  it('requires evidence_ids in ascending order without duplicates', () => {
    expect(
      issuesOf(Blindspot, {
        ...VALID,
        evidence_ids: [
          '01JD5M0A0A0A0A0A0A0A0A0A0A',
          '01JD3K8Q8Z6V7X2N4M5P9R0T1W',
        ],
      }),
    ).toEqual([['evidence_ids.1', 'field.not_sorted']]);
    expect(
      issuesOf(Blindspot, {
        ...VALID,
        evidence_ids: [
          '01JD3K8Q8Z6V7X2N4M5P9R0T1W',
          '01JD3K8Q8Z6V7X2N4M5P9R0T1W',
        ],
      }),
    ).toEqual([['evidence_ids.1', 'field.duplicate_item']]);
  });

  it('rejects an empty description', () => {
    expect(issuesOf(Blindspot, { ...VALID, description: ' ' })).toEqual([
      ['description', 'field.empty'],
    ]);
  });

  it('rejects unknown fields', () => {
    expect(
      issuesOf(Blindspot, { ...VALID, resolved_at: '2026-11-21T08:00:00Z' }),
    ).toEqual([['resolved_at', 'field.unknown']]);
  });
});
