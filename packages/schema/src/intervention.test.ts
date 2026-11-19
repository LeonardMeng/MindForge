import { describe, expect, it } from 'vitest';

import { Intervention } from './index.js';
import { codesOf, issuesOf } from './test-helpers.js';

const PLANNED = {
  schema_version: 1,
  id: '01JD6C0A0A0A0A0A0A0A0A0A0A',
  blindspot_id: '01JD6B0A0A0A0A0A0A0A0A0A0A',
  method: 'counterexample',
  content: '给出一个注意力权重全部相等的例子，让学习者解释输出为什么是平均值。',
  status: 'planned',
  closed_at: null,
  source: { kind: 'agent', id: 'agent-teacher', model: 'ollama:qwen3-14b' },
  created_at: '2026-11-20T08:10:00Z',
};

describe('Intervention', () => {
  it('accepts a planned intervention', () => {
    expect(codesOf(Intervention, PLANNED)).toEqual([]);
  });

  it.each(['explanation', 'socratic', 'practice', 'counterexample'])(
    'accepts method %s',
    (method) => {
      expect(codesOf(Intervention, { ...PLANNED, method })).toEqual([]);
    },
  );

  it.each(['completed', 'abandoned'])(
    'accepts a %s intervention with closed_at',
    (status) => {
      expect(
        codesOf(Intervention, {
          ...PLANNED,
          status,
          closed_at: '2026-11-20T09:00:00Z',
        }),
      ).toEqual([]);
    },
  );

  it('accepts closing in the same second it was created', () => {
    expect(
      codesOf(Intervention, {
        ...PLANNED,
        status: 'completed',
        closed_at: PLANNED.created_at,
      }),
    ).toEqual([]);
  });

  it.each([
    'schema_version',
    'id',
    'blindspot_id',
    'method',
    'content',
    'status',
    'closed_at',
    'source',
    'created_at',
  ])('requires %s (closed_at must be written even when null)', (field) => {
    const input: Record<string, unknown> = { ...PLANNED };
    delete input[field];
    expect(issuesOf(Intervention, input)).toEqual([[field, 'field.required']]);
  });

  it.each([
    ['method', 'lecture'],
    ['status', 'in_progress'],
  ])('rejects %s %j', (field, value) => {
    expect(issuesOf(Intervention, { ...PLANNED, [field]: value })).toEqual([
      [field, 'field.invalid_option'],
    ]);
  });

  describe('closed_at', () => {
    it.each(['completed', 'abandoned'])('is required when %s', (status) => {
      expect(issuesOf(Intervention, { ...PLANNED, status })).toEqual([
        ['closed_at', 'intervention.closed_at_required'],
      ]);
    });

    it('must be null while planned', () => {
      expect(
        issuesOf(Intervention, {
          ...PLANNED,
          closed_at: '2026-11-20T09:00:00Z',
        }),
      ).toEqual([['closed_at', 'intervention.closed_at_not_allowed']]);
    });

    it('cannot be earlier than created_at', () => {
      expect(
        issuesOf(Intervention, {
          ...PLANNED,
          status: 'completed',
          closed_at: '2026-11-20T08:09:59Z',
        }),
      ).toEqual([['closed_at', 'intervention.closed_before_created']]);
    });
  });

  it('does not carry concept_id (the blindspot already has it)', () => {
    expect(
      issuesOf(Intervention, { ...PLANNED, concept_id: 'self-attention' }),
    ).toEqual([['concept_id', 'field.unknown']]);
  });

  it('rejects empty content', () => {
    expect(issuesOf(Intervention, { ...PLANNED, content: '' })).toEqual([
      ['content', 'field.empty'],
    ]);
  });
});
