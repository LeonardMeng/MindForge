import { describe, expect, it } from 'vitest';

import { Evidence } from './index.js';
import { codesOf, issuesOf } from './test-helpers.js';

/** README 第 7 节的 Evidence 示例（加上 1.3 新增的 note）。 */
const README_EXAMPLE = {
  schema_version: 1,
  id: '01JD3K8Q8Z6V7X2N4M5P9R0T1W',
  concept_id: 'self-attention',
  session_id: '01JD3K7A2B3C4D5E6F7G8H9J0K',
  assessment_type: 'independent_verification',
  criteria_version: 1,
  dimensions: {
    recall: 0.9,
    understanding: 0.85,
    reasoning: 0.8,
    application: 0.7,
    transfer: null,
  },
  confidence: 0.88,
  evaluator: {
    kind: 'agent',
    id: 'agent-evaluator',
    model: 'ollama:qwen3-14b',
  },
  note: null,
  created_at: '2026-11-19T10:00:00Z',
};

/** 手动录入：没有会话，必须写明来由。 */
const MANUAL = {
  ...README_EXAMPLE,
  session_id: null,
  assessment_type: 'self_assessment',
  evaluator: { kind: 'human' },
  note: '课程期末考试 92 分',
};

describe('Evidence', () => {
  it('accepts the README example', () => {
    expect(codesOf(Evidence, README_EXAMPLE)).toEqual([]);
  });

  it('accepts manually entered evidence with a note', () => {
    expect(codesOf(Evidence, MANUAL)).toEqual([]);
  });

  it('accepts a note on evidence that has a session', () => {
    expect(
      codesOf(Evidence, { ...README_EXAMPLE, note: '复习时补测' }),
    ).toEqual([]);
  });

  it.each(['independent_verification', 'practice', 'self_assessment'])(
    'accepts assessment_type %s',
    (assessment_type) => {
      expect(codesOf(Evidence, { ...README_EXAMPLE, assessment_type })).toEqual(
        [],
      );
    },
  );

  it.each([
    'schema_version',
    'id',
    'concept_id',
    'session_id',
    'assessment_type',
    'criteria_version',
    'dimensions',
    'confidence',
    'evaluator',
    'note',
    'created_at',
  ])(
    'requires %s (session_id and note must be written even when null)',
    (field) => {
      const input: Record<string, unknown> = { ...README_EXAMPLE };
      delete input[field];
      expect(issuesOf(Evidence, input)).toEqual([[field, 'field.required']]);
    },
  );

  it('rejects an unknown assessment_type', () => {
    expect(
      issuesOf(Evidence, { ...README_EXAMPLE, assessment_type: 'quiz' }),
    ).toEqual([['assessment_type', 'field.invalid_option']]);
  });

  it('rejects evidence where every dimension is null', () => {
    expect(
      issuesOf(Evidence, {
        ...README_EXAMPLE,
        dimensions: {
          recall: null,
          understanding: null,
          reasoning: null,
          application: null,
          transfer: null,
        },
      }),
    ).toEqual([['dimensions', 'evidence.no_dimensions']]);
  });

  it('keeps a scored 0 distinct from not tested', () => {
    expect(
      codesOf(Evidence, {
        ...README_EXAMPLE,
        dimensions: {
          recall: 0,
          understanding: null,
          reasoning: null,
          application: null,
          transfer: null,
        },
      }),
    ).toEqual([]);
  });

  it.each([0, -1, 1.5, '1'])(
    'rejects criteria_version %j',
    (criteria_version) => {
      const [issue] = issuesOf(Evidence, {
        ...README_EXAMPLE,
        criteria_version,
      });
      expect(issue?.[0]).toBe('criteria_version');
    },
  );

  it('rejects a confidence outside 0..1', () => {
    expect(issuesOf(Evidence, { ...README_EXAMPLE, confidence: 1.2 })).toEqual([
      ['confidence', 'field.out_of_range'],
    ]);
  });

  it('rejects a lowercase ULID and a timestamp with milliseconds', () => {
    expect(
      issuesOf(Evidence, {
        ...README_EXAMPLE,
        id: '01jd3k8q8z6v7x2n4m5p9r0t1w',
        created_at: '2026-11-19T10:00:00.000Z',
      }),
    ).toEqual([
      ['id', 'ulid.not_uppercase'],
      ['created_at', 'iso_datetime.invalid_format'],
    ]);
  });

  describe('note', () => {
    it('is required (non-empty) when there is no session', () => {
      expect(issuesOf(Evidence, { ...MANUAL, note: null })).toEqual([
        ['note', 'evidence.note_required'],
      ]);
    });

    it.each(['', '  '])(
      'rejects an empty string %j (write null instead)',
      (note) => {
        expect(issuesOf(Evidence, { ...README_EXAMPLE, note })).toEqual([
          ['note', 'field.empty'],
        ]);
      },
    );
  });

  describe('evaluator', () => {
    const withEvaluator = (evaluator: unknown) => ({
      ...README_EXAMPLE,
      evaluator,
    });

    it.each([
      'ollama:qwen3-14b',
      'cloud:anthropic',
      'openai:gpt-4.1-mini',
      'mock:a/b',
    ])('accepts the model %s', (model) => {
      expect(
        codesOf(
          Evidence,
          withEvaluator({ kind: 'agent', id: 'agent-evaluator', model }),
        ),
      ).toEqual([]);
    });

    it.each([
      'qwen3',
      'ollama:',
      ':qwen3',
      'Ollama:qwen3',
      'ollama:qwen 3',
      '',
    ])('rejects the model %j', (model) => {
      expect(
        issuesOf(
          Evidence,
          withEvaluator({ kind: 'agent', id: 'agent-evaluator', model }),
        ),
      ).toEqual([['evaluator.model', 'evaluator.invalid_model']]);
    });

    it.each(['id', 'model'])('requires %s for an agent', (field) => {
      const evaluator: Record<string, unknown> = {
        kind: 'agent',
        id: 'agent-evaluator',
        model: 'ollama:qwen3-14b',
      };
      delete evaluator[field];
      expect(issuesOf(Evidence, withEvaluator(evaluator))).toEqual([
        [`evaluator.${field}`, 'field.required'],
      ]);
    });

    it('rejects an invalid agent id', () => {
      expect(
        issuesOf(
          Evidence,
          withEvaluator({
            kind: 'agent',
            id: 'Agent Evaluator',
            model: 'ollama:x',
          }),
        ),
      ).toEqual([['evaluator.id', 'slug.invalid_format']]);
    });

    it('rejects extra fields for a human', () => {
      expect(
        issuesOf(Evidence, withEvaluator({ kind: 'human', id: 'me' })),
      ).toEqual([['evaluator.id', 'field.unknown']]);
    });

    it('rejects an unknown kind', () => {
      expect(issuesOf(Evidence, withEvaluator({ kind: 'robot' }))).toEqual([
        ['evaluator.kind', 'field.invalid_option'],
      ]);
    });

    it('requires kind', () => {
      expect(
        issuesOf(Evidence, withEvaluator({ id: 'agent-evaluator' })),
      ).toEqual([['evaluator.kind', 'field.required']]);
    });

    it.each([null, 'agent'])('rejects %j as an evaluator', (evaluator) => {
      expect(issuesOf(Evidence, withEvaluator(evaluator))).toEqual([
        ['evaluator', 'field.invalid_type'],
      ]);
    });
  });

  it('rejects unknown fields', () => {
    expect(issuesOf(Evidence, { ...README_EXAMPLE, rationale: 'x' })).toEqual([
      ['rationale', 'field.unknown'],
    ]);
  });
});
