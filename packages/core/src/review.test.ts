import type { IsoDateTime, MasteryState } from '@mastery/schema';
import { MASTERY_STATES } from '@mastery/schema';
import { describe, expect, it } from 'vitest';

import { reviewStatus } from './index.js';

const DUE = '2026-12-01T09:00:00Z' as IsoDateTime;
const t = (value: string) => value as IsoDateTime;

describe('reviewStatus (2.7)', () => {
  it('a mastered projection is not due one second before its review time', () => {
    expect(
      reviewStatus(
        { state: 'mastered', review_due_at: DUE },
        t('2026-12-01T08:59:59Z'),
      ),
    ).toEqual({ dueAt: DUE, due: false, effectiveState: 'mastered' });
  });

  it('is due exactly at its review time and reads as needs_review', () => {
    expect(
      reviewStatus({ state: 'mastered', review_due_at: DUE }, DUE),
    ).toEqual({
      dueAt: DUE,
      due: true,
      effectiveState: 'needs_review',
    });
  });

  it('stays due after the review time', () => {
    expect(
      reviewStatus(
        { state: 'mastered', review_due_at: DUE },
        t('2027-06-01T00:00:00Z'),
      ).due,
    ).toBe(true);
  });

  it.each(MASTERY_STATES.filter((s) => s !== 'mastered'))(
    'a %s projection is never due and keeps its state',
    (state: MasteryState) => {
      expect(reviewStatus({ state, review_due_at: null }, DUE)).toEqual({
        dueAt: null,
        due: false,
        effectiveState: state,
      });
    },
  );
});
