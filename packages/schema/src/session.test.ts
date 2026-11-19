import { describe, expect, it } from 'vitest';

import { AssessmentSession } from './index.js';
import { codesOf, issuesOf } from './test-helpers.js';

const NO_SCORES = {
  recall: null,
  understanding: null,
  reasoning: null,
  application: null,
  transfer: null,
};

const ITEM = {
  dimensions: ['understanding', 'reasoning'],
  question: '为什么注意力分数要除以 √d？',
  answer: '防止点积太大，softmax 进入饱和区。',
  rationale: '说出了原因，但没有解释方差为什么随 d 增长。',
  scores: { ...NO_SCORES, understanding: 0.8, reasoning: 0.6 },
};

const VALID = {
  schema_version: 1,
  id: '01JD3K7A2B3C4D5E6F7G8H9J0K',
  concept_id: 'self-attention',
  criteria_version: 2,
  started_at: '2026-11-19T09:40:00Z',
  completed_at: '2026-11-19T10:00:00Z',
  items: [ITEM],
};

const withItem = (item: Record<string, unknown>) => ({
  ...VALID,
  items: [{ ...ITEM, ...item }],
});

describe('AssessmentSession', () => {
  it('accepts a valid session', () => {
    expect(codesOf(AssessmentSession, VALID)).toEqual([]);
  });

  it('accepts a session that starts and completes in the same second', () => {
    expect(
      codesOf(AssessmentSession, { ...VALID, completed_at: VALID.started_at }),
    ).toEqual([]);
  });

  it.each([
    'schema_version',
    'id',
    'concept_id',
    'criteria_version',
    'started_at',
    'completed_at',
    'items',
  ])('requires %s', (field) => {
    const input: Record<string, unknown> = { ...VALID };
    delete input[field];
    expect(issuesOf(AssessmentSession, input)).toEqual([
      [field, 'field.required'],
    ]);
  });

  it('rejects completed_at before started_at', () => {
    expect(
      issuesOf(AssessmentSession, {
        ...VALID,
        completed_at: '2026-11-19T09:39:59Z',
      }),
    ).toEqual([['completed_at', 'session.completed_before_started']]);
  });

  it('rejects a session without items', () => {
    expect(issuesOf(AssessmentSession, { ...VALID, items: [] })).toEqual([
      ['items', 'field.empty_list'],
    ]);
  });

  it('does not record evidence ids (evidence points back via session_id)', () => {
    expect(
      issuesOf(AssessmentSession, {
        ...VALID,
        evidence_ids: ['01JD3K8Q8Z6V7X2N4M5P9R0T1W'],
      }),
    ).toEqual([['evidence_ids', 'field.unknown']]);
  });

  describe('items', () => {
    it.each(['dimensions', 'question', 'answer', 'rationale', 'scores'])(
      'requires %s',
      (field) => {
        const item: Record<string, unknown> = { ...ITEM };
        delete item[field];
        expect(
          issuesOf(AssessmentSession, { ...VALID, items: [item] }),
        ).toEqual([[`items.0.${field}`, 'field.required']]);
      },
    );

    it('accepts an empty answer (the learner submitted nothing)', () => {
      expect(
        codesOf(AssessmentSession, withItem({ answer: '', scores: NO_SCORES })),
      ).toEqual([]);
    });

    it('accepts a tested dimension that could not be scored (null)', () => {
      expect(
        codesOf(
          AssessmentSession,
          withItem({ scores: { ...NO_SCORES, understanding: 0.8 } }),
        ),
      ).toEqual([]);
    });

    it('rejects a score for a dimension the question does not test', () => {
      expect(
        issuesOf(
          AssessmentSession,
          withItem({
            scores: { ...NO_SCORES, understanding: 0.8, transfer: 0.5 },
          }),
        ),
      ).toEqual([
        ['items.0.scores.transfer', 'session.score_outside_dimensions'],
      ]);
    });

    it('requires all five dimensions in scores', () => {
      const scores: Record<string, unknown> = { ...ITEM.scores };
      delete scores.transfer;
      expect(issuesOf(AssessmentSession, withItem({ scores }))).toEqual([
        ['items.0.scores.transfer', 'field.required'],
      ]);
    });

    it('rejects an empty, duplicated or unknown dimension list', () => {
      expect(issuesOf(AssessmentSession, withItem({ dimensions: [] }))).toEqual(
        [['items.0.dimensions', 'field.empty_list']],
      );
      expect(
        issuesOf(
          AssessmentSession,
          withItem({ dimensions: ['reasoning', 'reasoning'] }),
        ),
      ).toEqual([['items.0.dimensions.1', 'field.duplicate_item']]);
      expect(
        issuesOf(AssessmentSession, withItem({ dimensions: ['intuition'] })),
      ).toEqual([['items.0.dimensions.0', 'field.invalid_option']]);
    });

    it.each(['question', 'rationale'])('rejects an empty %s', (field) => {
      expect(issuesOf(AssessmentSession, withItem({ [field]: ' ' }))).toEqual([
        [`items.0.${field}`, 'field.empty'],
      ]);
    });

    it('reports the index of the item with the problem', () => {
      expect(
        issuesOf(AssessmentSession, {
          ...VALID,
          items: [ITEM, { ...ITEM, question: '' }],
        }),
      ).toEqual([['items.1.question', 'field.empty']]);
    });
  });
});
