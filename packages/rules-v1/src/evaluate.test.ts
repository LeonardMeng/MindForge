import type { Evaluation } from '@mastery/core';
import {
  DIMENSIONS,
  MASTERY_STATES,
  type Criteria,
  type Dimension,
  type Evidence,
} from '@mastery/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  aggregateV1,
  conditionsOf,
  EXPLANATION_CODES,
  evaluateV1,
  formatExplanation,
  rulesV1,
} from './index.js';

type Scores = Partial<Record<Dimension, number | null>>;
type EvidenceType = Evidence['assessment_type'];

const DAY_MS = 86_400_000;
const T0 = Date.parse('2026-11-01T00:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');
const ulid = (n: number) =>
  `01JD3K8Q8Z6V7X2N4M5P9R${String(n).padStart(4, '0')}`;

const NULLS: Record<Dimension, null> = {
  recall: null,
  understanding: null,
  reasoning: null,
  application: null,
  transfer: null,
};

/** softmax 的评测标准：考察 recall 0.8、understanding 0.7、application 0.6。 */
function criteria(
  overrides: Partial<Record<Dimension, number | null>> = {},
  version = 1,
): Criteria {
  const thresholds: Record<Dimension, number | null> = {
    ...NULLS,
    recall: 0.8,
    understanding: 0.7,
    application: 0.6,
    ...overrides,
  };
  const dimensions = {} as Record<
    Dimension,
    { focus: string[]; threshold: number } | null
  >;
  for (const d of DIMENSIONS) {
    const threshold = thresholds[d];
    dimensions[d] =
      threshold === null ? null : { focus: [`${d} focus`], threshold };
  }
  return {
    schema_version: 1,
    concept_id: 'softmax',
    version,
    dimensions,
  } as Criteria;
}

interface Spec {
  /** 第几天（可以是小数）。 */
  readonly day: number;
  readonly type?: EvidenceType;
  readonly scores: Scores;
  readonly criteriaVersion?: number;
}

function evidence(specs: readonly Spec[]): Evidence[] {
  return specs.map(
    (spec, i) =>
      ({
        schema_version: 1,
        id: ulid(i),
        concept_id: 'softmax',
        session_id: null,
        assessment_type: spec.type ?? 'independent_verification',
        criteria_version: spec.criteriaVersion ?? 1,
        dimensions: { ...NULLS, ...spec.scores },
        confidence: 1,
        evaluator: { kind: 'human' },
        note: 'test',
        created_at: iso(T0 + Math.round(spec.day * DAY_MS)),
      }) as Evidence,
  );
}

/** 一次通过的独立验证，三个考察的维度都打了分。 */
const FULL: Scores = { recall: 0.9, understanding: 0.8, application: 0.7 };
const PASS = (day: number, extra: Partial<Spec> = {}): Spec => ({
  day,
  scores: FULL,
  ...extra,
});
const PRACTICE: EvidenceType = 'practice';
const SELF: EvidenceType = 'self_assessment';

const run = (specs: readonly Spec[], c: Criteria = criteria()) =>
  evaluateV1(evidence(specs), c);
const path = (result: Evaluation) => result.steps.map((step) => step.to);
const codes = (result: Evaluation) =>
  result.explanation.map((item) => item.code);

/** mastered → needs_review → learning → provisional_mastery → mastered。 */
const REGRESSION: readonly Spec[] = [
  PASS(0),
  PASS(7),
  { day: 8, type: PRACTICE, scores: { recall: 0.2 } },
  { day: 9, scores: { recall: 0.7 } },
  { day: 10, type: PRACTICE, scores: { recall: 1 } },
  { day: 10.5, type: PRACTICE, scores: { recall: 1 } },
  { day: 10.75, type: PRACTICE, scores: { recall: 1 } },
  PASS(11),
];

describe('rules v1 state machine: transitions', () => {
  it('no evidence → not_assessed, no steps', () => {
    const result = run([]);
    expect(result.state).toBe('not_assessed');
    expect(result.steps).toEqual([]);
  });

  it('not_assessed → diagnosed on weak first evidence', () => {
    expect(path(run([{ day: 0, scores: { recall: 0.5 } }]))).toEqual([
      'diagnosed',
    ]);
  });

  it('diagnosed → learning on further evidence that does not meet P', () => {
    expect(
      path(
        run([
          { day: 0, scores: { recall: 0.5 } },
          { day: 1, type: PRACTICE, scores: { recall: 0.6 } },
        ]),
      ),
    ).toEqual(['diagnosed', 'learning']);
  });

  it('not_assessed → provisional_mastery when the first evidence meets P (skip)', () => {
    expect(path(run([PASS(0)]))).toEqual(['provisional_mastery']);
  });

  it('diagnosed → provisional_mastery (skip learning)', () => {
    expect(
      path(run([{ day: 0, type: SELF, scores: { recall: 0.5 } }, PASS(1)])),
    ).toEqual(['diagnosed', 'provisional_mastery']);
  });

  it('learning → provisional_mastery', () => {
    expect(
      path(
        run([
          { day: 0, type: SELF, scores: { recall: 0.8 } },
          { day: 0.5, type: SELF, scores: { recall: 0.8 } },
          PASS(1),
        ]),
      ),
    ).toEqual(['diagnosed', 'learning', 'provisional_mastery']);
  });

  it('provisional_mastery → mastered: two passing verifications 7 days apart', () => {
    const result = run([PASS(0), PASS(7)]);
    expect(path(result)).toEqual(['provisional_mastery', 'mastered']);
    expect(result.state).toBe('mastered');
  });

  it('6 days 23:59:59 apart is not enough', () => {
    const result = run([PASS(0), PASS(7 - 1 / 86_400)]);
    expect(path(result)).toEqual([
      'provisional_mastery',
      'provisional_mastery',
    ]);
    expect(result.explanation).toContainEqual({
      code: 'missing.spacing',
      params: { days: 6, need: 7 },
    });
  });

  it('provisional_mastery → learning when a failed verification pulls a dimension below', () => {
    const result = run([PASS(0), { day: 7, scores: { ...FULL, recall: 0.7 } }]);
    expect(path(result)).toEqual(['provisional_mastery', 'learning']);
    expect(codes(result)).toContain('missing.below_threshold');
  });

  it('mastered stays mastered while P holds', () => {
    expect(
      path(
        run([
          PASS(0),
          PASS(7),
          { day: 8, type: PRACTICE, scores: { recall: 0.85 } },
        ]),
      ),
    ).toEqual(['provisional_mastery', 'mastered', 'mastered']);
  });

  it('mastered → needs_review when P fails', () => {
    expect(
      path(
        run([
          PASS(0),
          PASS(7),
          { day: 8, type: PRACTICE, scores: { recall: 0.2 } },
        ]),
      ),
    ).toEqual(['provisional_mastery', 'mastered', 'needs_review']);
  });

  it('needs_review stays on evidence that is not a verification and does not restore P', () => {
    expect(
      path(
        run([
          PASS(0),
          PASS(7),
          { day: 8, type: PRACTICE, scores: { recall: 0.2 } },
          { day: 8.5, type: PRACTICE, scores: { recall: 0.3 } },
        ]),
      ).slice(2),
    ).toEqual(['needs_review', 'needs_review']);
  });

  it('needs_review waits for a passing verification when practice restores P', () => {
    const result = run([
      PASS(0),
      PASS(7),
      { day: 8, type: PRACTICE, scores: { recall: 0.2 } },
      { day: 8.5, type: PRACTICE, scores: { recall: 1 } },
      { day: 8.75, type: PRACTICE, scores: { recall: 1 } },
    ]);
    expect(path(result).slice(2)).toEqual([
      'needs_review',
      'needs_review',
      'needs_review',
    ]);
    expect(codes(result)).toContain('missing.reverification');
  });

  it('needs_review → mastered on a passing verification', () => {
    expect(
      path(
        run([
          PASS(0),
          PASS(7),
          { day: 8, type: PRACTICE, scores: { recall: 0.2 } },
          { day: 8.5, type: PRACTICE, scores: { recall: 1 } },
          { day: 8.75, type: PRACTICE, scores: { recall: 1 } },
          PASS(9),
        ]),
      ).slice(2),
    ).toEqual(['needs_review', 'needs_review', 'needs_review', 'mastered']);
  });

  it('needs_review → learning on a failed verification', () => {
    expect(
      path(
        run([
          PASS(0),
          PASS(7),
          { day: 8, type: PRACTICE, scores: { recall: 0.2 } },
          { day: 9, scores: { recall: 0.4 } },
        ]),
      ).slice(2),
    ).toEqual(['needs_review', 'learning']);
  });

  it('after a regression, mastery needs a new passing verification (learning → provisional → mastered)', () => {
    const result = run(REGRESSION);
    expect(path(result)).toEqual([
      'provisional_mastery',
      'mastered',
      'needs_review',
      'learning',
      'learning',
      'learning',
      'provisional_mastery',
      'mastered',
    ]);
    // 停在 provisional_mastery 时，条件都满足了，只差一次新的通过的独立验证。
    const waiting = evaluateV1(evidence(REGRESSION.slice(0, -1)), criteria());
    expect(waiting.state).toBe('provisional_mastery');
    expect(codes(waiting)).toContain('missing.reverification');
  });

  it('learning → mastered directly when a passing verification restores P', () => {
    expect(
      path(
        run([
          PASS(0),
          PASS(7),
          { day: 8, type: PRACTICE, scores: { recall: 0.2 } },
          { day: 9, scores: { recall: 0.7 } },
          { day: 10, type: PRACTICE, scores: { recall: 1 } },
          { day: 10.5, type: PRACTICE, scores: { recall: 1 } },
          PASS(11),
        ]),
      ).slice(3),
    ).toEqual(['learning', 'learning', 'learning', 'mastered']);
  });
});

describe('rules v1 state machine: conditions', () => {
  it('an untested assessed dimension blocks P', () => {
    const result = run([
      { day: 0, scores: { recall: 0.9, understanding: 0.8 } },
    ]);
    expect(result.state).toBe('diagnosed');
    expect(result.explanation).toContainEqual({
      code: 'missing.untested',
      params: { dimension: 'application' },
    });
  });

  it('every assessed dimension must be covered by a passing verification', () => {
    const result = run([
      { day: 0, scores: { recall: 0.9, understanding: 0.8 } },
      { day: 0, type: PRACTICE, scores: { application: 0.7 } },
      { day: 7, scores: { recall: 0.9, understanding: 0.8 } },
    ]);
    expect(result.state).toBe('provisional_mastery');
    expect(result.explanation).toContainEqual({
      code: 'missing.verification_coverage',
      params: { dimension: 'application' },
    });
  });

  it('when the criteria assess transfer, a passing verification must score it', () => {
    const c = criteria({ transfer: 0.5 });
    const practiceTransfer: Spec = {
      day: 0,
      type: PRACTICE,
      scores: { transfer: 0.6 },
    };
    const without = run([practiceTransfer, PASS(0), PASS(7)], c);
    expect(without.state).toBe('provisional_mastery');
    expect(without.explanation).toContainEqual({
      code: 'missing.verification_coverage',
      params: { dimension: 'transfer' },
    });
    const withTransfer = run(
      [
        practiceTransfer,
        PASS(0),
        PASS(7, { scores: { ...FULL, transfer: 0.6 } }),
      ],
      c,
    );
    expect(withTransfer.state).toBe('mastered');
  });

  it('when the criteria do not assess transfer, there is no transfer requirement', () => {
    expect(run([PASS(0), PASS(7)]).state).toBe('mastered');
  });

  it('only verifications at the current criteria version count', () => {
    const c = criteria({}, 2);
    const old = run(
      [PASS(0, { criteriaVersion: 1 }), PASS(7, { criteriaVersion: 1 })],
      c,
    );
    expect(path(old)).toEqual(['diagnosed', 'learning']);
    expect(old.explanation).toContainEqual({
      code: 'missing.independent_verifications',
      params: { have: 0, need: 1 },
    });
    // 旧版本的证据仍然参与分数。
    expect(old.aggregate.dimensions.recall).toBe(0.9);
    const current = run(
      [
        PASS(0, { criteriaVersion: 1 }),
        PASS(7, { criteriaVersion: 1 }),
        PASS(8, { criteriaVersion: 2 }),
      ],
      c,
    );
    expect(current.state).toBe('provisional_mastery');
  });

  it('a verification with a score below a threshold does not count as passing', () => {
    const result = run([
      PASS(0),
      { day: 7, scores: { ...FULL, application: 0.5 } },
      PASS(8),
    ]);
    expect(result.explanation).toContainEqual({
      code: 'met.independent_verifications',
      params: { count: 2 },
    });
    expect(result.state).toBe('mastered');
  });

  it('a verification that scores no assessed dimension does not count', () => {
    const result = run([PASS(0), { day: 7, scores: { reasoning: 0.9 } }]);
    expect(
      conditionsOf(
        evidence([PASS(0), { day: 7, scores: { reasoning: 0.9 } }]),
        criteria(),
      ).passing,
    ).toHaveLength(1);
    expect(result.state).toBe('provisional_mastery');
  });
});

describe('rules v1 state machine: steps', () => {
  it('records one step per evidence, in (created_at, id) order, with the running aggregate', () => {
    const list = evidence([PASS(7), { day: 0, scores: { recall: 0.5 } }]);
    const result = evaluateV1(list, criteria());
    expect(result.steps).toEqual([
      {
        from: 'not_assessed',
        to: 'diagnosed',
        evidenceId: ulid(1),
        at: '2026-11-01T00:00:00Z',
        dimensions: { ...NULLS, recall: 0.5 },
        confidence: 0.5,
      },
      {
        from: 'diagnosed',
        to: 'learning',
        evidenceId: ulid(0),
        at: '2026-11-08T00:00:00Z',
        dimensions: aggregateV1(list).dimensions,
        confidence: aggregateV1(list).confidence,
      },
    ]);
  });

  it('breaks created_at ties by id', () => {
    const list = evidence([
      { day: 0, scores: { recall: 0.5 } },
      { day: 0, scores: { recall: 0.6 } },
    ]);
    expect(
      evaluateV1([...list].reverse(), criteria()).steps.map(
        (s) => s.evidenceId,
      ),
    ).toEqual([ulid(0), ulid(1)]);
  });

  it('rulesV1.evaluate is evaluateV1', () => {
    const list = evidence([PASS(0)]);
    expect(rulesV1.evaluate(list, criteria())).toEqual(
      evaluateV1(list, criteria()),
    );
  });
});

describe('rules v1 explanation (snapshots)', () => {
  const explain = (result: Evaluation) => ({
    items: result.explanation,
    text: result.explanation.map(formatExplanation),
  });

  it('not_assessed', () => {
    expect(explain(run([]))).toMatchInlineSnapshot(`
      {
        "items": [
          {
            "code": "state.not_assessed",
            "params": {},
          },
          {
            "code": "missing.untested",
            "params": {
              "dimension": "recall",
            },
          },
          {
            "code": "missing.untested",
            "params": {
              "dimension": "understanding",
            },
          },
          {
            "code": "missing.untested",
            "params": {
              "dimension": "application",
            },
          },
          {
            "code": "missing.independent_verifications",
            "params": {
              "have": 0,
              "need": 1,
            },
          },
        ],
        "text": [
          "not assessed yet: there is no evidence",
          "recall has not been assessed",
          "understanding has not been assessed",
          "application has not been assessed",
          "0 of 1 passing independent verification(s)",
        ],
      }
    `);
  });

  it('diagnosed', () => {
    expect(
      explain(run([{ day: 0, scores: { recall: 0.5, understanding: 0.8 } }])),
    ).toMatchInlineSnapshot(`
      {
        "items": [
          {
            "code": "state.diagnosed",
            "params": {},
          },
          {
            "code": "missing.untested",
            "params": {
              "dimension": "application",
            },
          },
          {
            "code": "missing.below_threshold",
            "params": {
              "dimension": "recall",
              "score": 0.5,
              "threshold": 0.8,
            },
          },
          {
            "code": "missing.independent_verifications",
            "params": {
              "have": 0,
              "need": 1,
            },
          },
        ],
        "text": [
          "diagnosed: the first evidence shows where you stand",
          "application has not been assessed",
          "recall is 0.5, below the threshold 0.8",
          "0 of 1 passing independent verification(s)",
        ],
      }
    `);
  });

  it('learning', () => {
    expect(
      explain(run([PASS(0), { day: 7, scores: { ...FULL, recall: 0.7 } }])),
    ).toMatchInlineSnapshot(`
      {
        "items": [
          {
            "code": "state.learning",
            "params": {},
          },
          {
            "code": "met.independent_verifications",
            "params": {
              "count": 1,
            },
          },
          {
            "code": "missing.below_threshold",
            "params": {
              "dimension": "recall",
              "score": 0.7896,
              "threshold": 0.8,
            },
          },
        ],
        "text": [
          "learning: the conditions for provisional mastery are not met yet",
          "1 passing independent verification(s) at the current criteria version",
          "recall is 0.7896, below the threshold 0.8",
        ],
      }
    `);
  });

  it('provisional_mastery, waiting for a second verification', () => {
    expect(explain(run([PASS(0)]))).toMatchInlineSnapshot(`
      {
        "items": [
          {
            "code": "state.provisional_mastery",
            "params": {},
          },
          {
            "code": "met.independent_verifications",
            "params": {
              "count": 1,
            },
          },
          {
            "code": "missing.independent_verifications",
            "params": {
              "have": 1,
              "need": 2,
            },
          },
        ],
        "text": [
          "provisional mastery: every assessed dimension meets its threshold",
          "1 passing independent verification(s) at the current criteria version",
          "1 of 2 passing independent verification(s)",
        ],
      }
    `);
  });

  it('provisional_mastery, verifications too close together and coverage missing', () => {
    expect(
      explain(
        run([
          { day: 0, scores: { recall: 0.9, understanding: 0.8 } },
          { day: 0, type: PRACTICE, scores: { application: 0.7 } },
          { day: 3, scores: { recall: 0.9, understanding: 0.8 } },
        ]),
      ),
    ).toMatchInlineSnapshot(`
      {
        "items": [
          {
            "code": "state.provisional_mastery",
            "params": {},
          },
          {
            "code": "met.independent_verifications",
            "params": {
              "count": 2,
            },
          },
          {
            "code": "missing.spacing",
            "params": {
              "days": 3,
              "need": 7,
            },
          },
          {
            "code": "missing.verification_coverage",
            "params": {
              "dimension": "application",
            },
          },
        ],
        "text": [
          "provisional mastery: every assessed dimension meets its threshold",
          "2 passing independent verification(s) at the current criteria version",
          "the passing independent verifications span 3 day(s); at least 7 are needed",
          "application has not been scored by a passing independent verification",
        ],
      }
    `);
  });

  it('mastered', () => {
    expect(explain(run([PASS(0), PASS(7)]))).toMatchInlineSnapshot(`
      {
        "items": [
          {
            "code": "state.mastered",
            "params": {},
          },
          {
            "code": "met.independent_verifications",
            "params": {
              "count": 2,
            },
          },
        ],
        "text": [
          "mastered: confirmed by spaced independent verifications covering every assessed dimension",
          "2 passing independent verification(s) at the current criteria version",
        ],
      }
    `);
  });

  it('needs_review', () => {
    expect(
      explain(
        run([
          PASS(0),
          PASS(7),
          { day: 8, type: PRACTICE, scores: { recall: 0.2 } },
        ]),
      ),
    ).toMatchInlineSnapshot(`
      {
        "items": [
          {
            "code": "state.needs_review",
            "params": {},
          },
          {
            "code": "met.independent_verifications",
            "params": {
              "count": 2,
            },
          },
          {
            "code": "missing.below_threshold",
            "params": {
              "dimension": "recall",
              "score": 0.7218,
              "threshold": 0.8,
            },
          },
        ],
        "text": [
          "needs review: it was mastered, but later evidence did not hold up; it must be verified again",
          "2 passing independent verification(s) at the current criteria version",
          "recall is 0.7218, below the threshold 0.8",
        ],
      }
    `);
  });

  it('needs_review, waiting for reverification', () => {
    expect(
      explain(
        run([
          PASS(0),
          PASS(7),
          { day: 8, type: PRACTICE, scores: { recall: 0.2 } },
          { day: 8.5, type: PRACTICE, scores: { recall: 1 } },
          { day: 8.75, type: PRACTICE, scores: { recall: 1 } },
        ]),
      ),
    ).toMatchInlineSnapshot(`
      {
        "items": [
          {
            "code": "state.needs_review",
            "params": {},
          },
          {
            "code": "met.independent_verifications",
            "params": {
              "count": 2,
            },
          },
          {
            "code": "missing.reverification",
            "params": {},
          },
        ],
        "text": [
          "needs review: it was mastered, but later evidence did not hold up; it must be verified again",
          "2 passing independent verification(s) at the current criteria version",
          "every condition is met again; a new passing independent verification confirms mastery",
        ],
      }
    `);
  });

  it('every explanation code has a message', () => {
    for (const code of EXPLANATION_CODES) {
      expect(formatExplanation({ code, params: {} })).not.toBe(code);
    }
    expect(formatExplanation({ code: 'other.unknown', params: {} })).toBe(
      'other.unknown',
    );
  });
});

// ── 属性测试 ────────────────────────────────────────────────────────────────

const scoreArb = fc.option(
  fc.integer({ min: 0, max: 100 }).map((n) => n / 100),
  { nil: null },
);
const specArb: fc.Arbitrary<Spec> = fc.record({
  day: fc.integer({ min: 0, max: 60 }),
  type: fc.constantFrom<EvidenceType>(
    'independent_verification',
    PRACTICE,
    SELF,
  ),
  criteriaVersion: fc.integer({ min: 1, max: 2 }),
  scores: fc.record({
    recall: scoreArb,
    understanding: scoreArb,
    reasoning: scoreArb,
    application: scoreArb,
    transfer: scoreArb,
  }),
});
const thresholdArb = fc.option(
  fc.integer({ min: 1, max: 9 }).map((n) => n / 10),
  { nil: null },
);
const criteriaArb = fc
  .record({
    version: fc.integer({ min: 1, max: 2 }),
    recall: thresholdArb,
    understanding: thresholdArb,
    reasoning: thresholdArb,
    application: thresholdArb,
    transfer: thresholdArb,
  })
  .filter((t) => DIMENSIONS.some((d) => t[d] !== null))
  .map(({ version, ...thresholds }) => criteria(thresholds, version));
const evidenceArb = fc
  .array(specArb, { maxLength: 8 })
  .map((specs) => evidence(specs));

describe('rules v1 state machine (properties)', () => {
  it('the order of the evidence does not change the result', () => {
    fc.assert(
      fc.property(
        evidenceArb.chain((list) =>
          fc
            .shuffledSubarray(list, {
              minLength: list.length,
              maxLength: list.length,
            })
            .map((shuffled) => [list, shuffled] as const),
        ),
        criteriaArb,
        ([list, shuffled], c) => {
          expect(evaluateV1(shuffled, c)).toEqual(evaluateV1(list, c));
        },
      ),
    );
  });

  it('the aggregate is the 2.3 aggregation of all evidence', () => {
    fc.assert(
      fc.property(evidenceArb, criteriaArb, (list, c) => {
        expect(evaluateV1(list, c).aggregate).toEqual(aggregateV1(list));
      }),
    );
  });

  it('the steps form a chain from not_assessed to the final state', () => {
    fc.assert(
      fc.property(evidenceArb, criteriaArb, (list, c) => {
        const result = evaluateV1(list, c);
        expect(result.steps).toHaveLength(list.length);
        let state: string = 'not_assessed';
        for (const step of result.steps) {
          expect(step.from).toBe(state);
          expect(MASTERY_STATES).toContain(step.to);
          state = step.to;
        }
        expect(result.state).toBe(state);
        expect(result.explanation[0]?.code).toBe(`state.${result.state}`);
      }),
    );
  });

  it('mastered always means M holds; needs_review only follows mastered', () => {
    fc.assert(
      fc.property(evidenceArb, criteriaArb, (list, c) => {
        const result = evaluateV1(list, c);
        const sorted = [...list].sort((a, b) =>
          a.created_at === b.created_at
            ? a.id < b.id
              ? -1
              : 1
            : a.created_at < b.created_at
              ? -1
              : 1,
        );
        result.steps.forEach((step, i) => {
          if (step.to === 'mastered') {
            expect(conditionsOf(sorted.slice(0, i + 1), c).mastered).toBe(true);
          }
          if (step.to === 'needs_review') {
            expect(['mastered', 'needs_review']).toContain(step.from);
          }
        });
      }),
    );
  });

  it('every explanation code is one of the v1 codes', () => {
    fc.assert(
      fc.property(evidenceArb, criteriaArb, (list, c) => {
        for (const item of evaluateV1(list, c).explanation) {
          expect(EXPLANATION_CODES).toContain(item.code);
        }
      }),
    );
  });

  it('computing twice gives the same bytes', () => {
    fc.assert(
      fc.property(evidenceArb, criteriaArb, (list, c) => {
        expect(JSON.stringify(evaluateV1(list, c))).toBe(
          JSON.stringify(evaluateV1(list, c)),
        );
      }),
    );
  });
});
