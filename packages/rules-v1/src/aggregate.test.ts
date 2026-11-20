import type { Aggregate } from '@mastery/core';
import { DIMENSIONS, type Dimension, type Evidence } from '@mastery/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { aggregateV1, rulesV1, V1_PARAMETERS } from './index.js';

type Scores = Partial<Record<Dimension, number | null>>;
type EvidenceType = Evidence['assessment_type'];

const DAY_MS = 86_400_000;
const T0 = Date.parse('2026-11-01T00:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

const NULLS: Record<Dimension, null> = {
  recall: null,
  understanding: null,
  reasoning: null,
  application: null,
  transfer: null,
};

/** 第 n 个 ULID（只用数字，按 n 递增）。 */
const ulid = (n: number) =>
  `01JD3K8Q8Z6V7X2N4M5P9R${String(n).padStart(4, '0')}`;

interface Spec {
  readonly day?: number;
  readonly type?: EvidenceType;
  readonly confidence?: number;
  readonly scores: Scores;
  readonly criteriaVersion?: number;
}

/** 按顺序编号的证据：第 i 条的 id 是 ulid(i)。 */
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
        confidence: spec.confidence ?? 1,
        evaluator: { kind: 'human' },
        note: 'test',
        created_at: iso(T0 + (spec.day ?? 0) * DAY_MS),
      }) as Evidence,
  );
}

const IV: EvidenceType = 'independent_verification';
const PRACTICE: EvidenceType = 'practice';
const SELF: EvidenceType = 'self_assessment';

interface Row {
  readonly name: string;
  readonly specs: readonly Spec[];
  readonly dimension?: Dimension;
  /** 维度的分数；null 表示没有分数。 */
  readonly score: number | null;
  /** 维度的置信度（score 为 null 时不检查）。 */
  readonly dimensionConfidence?: number;
  readonly evidenceCount?: number;
  /** 总置信度。 */
  readonly confidence?: number;
}

// 期望值是手算的（用分数精确计算，再四舍五入到 4 位小数）。公式见 ADR-0007。
const TABLE: readonly Row[] = [
  { name: 'no evidence', specs: [], score: null, confidence: 0 },
  {
    name: 'evidence that does not score the dimension',
    specs: [{ scores: { understanding: 0.7 } }],
    score: null,
  },
  {
    name: 'one independent verification',
    specs: [{ scores: { recall: 0.8 } }],
    score: 0.8,
    dimensionConfidence: 0.5,
    evidenceCount: 1,
    confidence: 0.5,
  },
  {
    name: 'a score of 0 is a score, not null',
    specs: [{ scores: { recall: 0 } }],
    score: 0,
    dimensionConfidence: 0.5,
  },
  {
    name: "the evidence's confidence scales the confidence, not the score",
    specs: [{ confidence: 0.8, scores: { recall: 0.8 } }],
    score: 0.8,
    dimensionConfidence: 0.4444,
  },
  {
    name: 'evidence with confidence 0 still gives a score',
    specs: [{ confidence: 0, scores: { recall: 0.6 } }],
    score: 0.6,
    dimensionConfidence: 0,
    confidence: 0,
  },
  {
    name: 'two agreeing scores raise the confidence',
    specs: [{ scores: { recall: 1 } }, { day: 30, scores: { recall: 1 } }],
    score: 1,
    dimensionConfidence: 0.6,
    evidenceCount: 2,
  },
  {
    name: 'four consistent scores',
    specs: [0, 1, 2, 3].map(() => ({ scores: { recall: 0.9 } })),
    score: 0.9,
    dimensionConfidence: 0.8,
    evidenceCount: 4,
  },
  {
    name: 'partly inconsistent scores lower the confidence',
    specs: [{ scores: { recall: 0.6 } }, { scores: { recall: 1 } }],
    score: 0.8,
    dimensionConfidence: 0.4,
  },
  {
    name: 'contradictory scores give confidence 0',
    specs: [{ scores: { recall: 0 } }, { scores: { recall: 1 } }],
    score: 0.5,
    dimensionConfidence: 0,
  },
  {
    name: 'independent verification outweighs self-assessment',
    specs: [{ scores: { recall: 1 } }, { type: SELF, scores: { recall: 0 } }],
    score: 0.7692,
    dimensionConfidence: 0.1639,
  },
  {
    name: 'practice weighs 0.6',
    specs: [
      { type: PRACTICE, scores: { recall: 1 } },
      { scores: { recall: 0.5 } },
    ],
    score: 0.6875,
    dimensionConfidence: 0.3269,
  },
  {
    name: 'self-assessment alone gives low confidence',
    specs: [{ type: SELF, scores: { recall: 0.9 } }],
    score: 0.9,
    dimensionConfidence: 0.2308,
  },
  {
    name: 'evidence H days older than the newest weighs half',
    specs: [{ scores: { recall: 1 } }, { day: 30, scores: { recall: 0 } }],
    score: 0.3333,
    dimensionConfidence: 0.0667,
  },
  {
    name: 'evidence 3H days older than the newest weighs a quarter',
    specs: [{ scores: { recall: 1 } }, { day: 90, scores: { recall: 0 } }],
    score: 0.2,
    dimensionConfidence: 0.2,
  },
  {
    name: 'age is measured from the newest evidence of that dimension',
    // 第二条证据只测了 recall，不能让 understanding 的证据变“旧”。
    specs: [
      { scores: { recall: 1, understanding: 0.8 } },
      { day: 300, scores: { recall: 1 } },
    ],
    dimension: 'understanding',
    score: 0.8,
    dimensionConfidence: 0.5,
    evidenceCount: 1,
  },
  {
    name: 'evidence from different criteria versions is aggregated together',
    specs: [
      { criteriaVersion: 1, scores: { recall: 0.6 } },
      { criteriaVersion: 2, scores: { recall: 1 } },
    ],
    score: 0.8,
    dimensionConfidence: 0.4,
  },
  {
    name: 'rounds to 4 decimals (2/3 up)',
    specs: [{ scores: { recall: 1 } }, { day: 30, scores: { recall: 0.5 } }],
    // 权重 0.5 和 1：(0.5 + 0.5) / 1.5 = 0.6667
    score: 0.6667,
  },
  {
    name: 'the overall confidence is the mean over scored dimensions',
    specs: [
      { scores: { recall: 0.8, understanding: 0 } },
      { scores: { understanding: 1 } },
    ],
    dimension: 'recall',
    score: 0.8,
    dimensionConfidence: 0.5,
    // recall 0.5，understanding 0（矛盾），平均 0.25
    confidence: 0.25,
  },
];

describe('rules v1 aggregation (table)', () => {
  it.each(TABLE)('$name', (row) => {
    const result = aggregateV1(evidence(row.specs));
    const dimension = row.dimension ?? 'recall';
    expect(result.dimensions[dimension]).toBe(row.score);
    const detail = result.perDimension[dimension];
    if (row.score === null) {
      expect(detail).toBeNull();
    } else {
      expect(detail?.score).toBe(row.score);
      if (row.dimensionConfidence !== undefined) {
        expect(detail?.confidence).toBe(row.dimensionConfidence);
      }
      if (row.evidenceCount !== undefined) {
        expect(detail?.evidenceCount).toBe(row.evidenceCount);
      }
    }
    if (row.confidence !== undefined) {
      expect(result.confidence).toBe(row.confidence);
    }
  });

  it('scores the five dimensions independently', () => {
    const result = aggregateV1(
      evidence([
        {
          scores: {
            recall: 0.1,
            understanding: 0.2,
            reasoning: 0.3,
            application: 0.4,
            transfer: 0.5,
          },
        },
      ]),
    );
    expect(result.dimensions).toEqual({
      recall: 0.1,
      understanding: 0.2,
      reasoning: 0.3,
      application: 0.4,
      transfer: 0.5,
    });
  });

  it('returns no scores and confidence 0 for no evidence', () => {
    expect(aggregateV1([])).toEqual({
      dimensions: NULLS,
      confidence: 0,
      perDimension: NULLS,
    });
  });
});

describe('rules v1: the Rules object and parameters (ADR-0007)', () => {
  it('is version 1 and aggregates with aggregateV1', () => {
    expect(rulesV1.version).toBe(1);
    const input = evidence([{ scores: { recall: 0.8 } }]);
    expect(rulesV1.aggregate(input)).toEqual(aggregateV1(input));
  });

  it('records the provisional parameters', () => {
    expect(V1_PARAMETERS).toEqual({
      halfWeightDays: 30,
      typeWeights: {
        independent_verification: 1,
        practice: 0.6,
        self_assessment: 0.3,
      },
      decimals: 4,
    });
    expect(Object.isFrozen(V1_PARAMETERS)).toBe(true);
    expect(Object.isFrozen(V1_PARAMETERS.typeWeights)).toBe(true);
  });

  it('does not modify its input', () => {
    const input = evidence([
      { day: 5, scores: { recall: 0.2 } },
      { scores: { recall: 0.9 } },
    ]).reverse();
    const copy = JSON.parse(JSON.stringify(input)) as unknown;
    aggregateV1(input);
    expect(input).toEqual(copy);
  });
});

// ── 属性测试 ────────────────────────────────────────────────────────────────

const scoreArb = fc.option(
  fc.integer({ min: 0, max: 100 }).map((n) => n / 100),
  { nil: null },
);
const specArb: fc.Arbitrary<Spec> = fc.record({
  day: fc.integer({ min: 0, max: 400 }),
  type: fc.constantFrom(IV, PRACTICE, SELF),
  confidence: fc.integer({ min: 0, max: 100 }).map((n) => n / 100),
  criteriaVersion: fc.integer({ min: 1, max: 3 }),
  scores: fc.record({
    recall: scoreArb,
    understanding: scoreArb,
    reasoning: scoreArb,
    application: scoreArb,
    transfer: scoreArb,
  }),
});
const evidenceArb = fc
  .array(specArb, { maxLength: 8 })
  .map((specs) => evidence(specs));

/** 结果里的所有数。 */
function numbers(result: Aggregate): number[] {
  const values: number[] = [result.confidence];
  for (const dimension of DIMENSIONS) {
    const score = result.dimensions[dimension];
    if (score !== null) values.push(score);
    const detail = result.perDimension[dimension];
    if (detail !== null) values.push(detail.score, detail.confidence);
  }
  return values;
}

describe('rules v1 aggregation (properties)', () => {
  it('a dimension that only has nulls stays null', () => {
    fc.assert(
      fc.property(evidenceArb, fc.constantFrom(...DIMENSIONS), (list, d) => {
        const nulled = list.map((e) => ({
          ...e,
          dimensions: { ...e.dimensions, [d]: null },
        }));
        const result = aggregateV1(nulled);
        expect(result.dimensions[d]).toBeNull();
        expect(result.perDimension[d]).toBeNull();
      }),
    );
  });

  it('every number is within 0..1 and never -0', () => {
    fc.assert(
      fc.property(evidenceArb, (list) => {
        for (const value of numbers(aggregateV1(list))) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
          expect(Object.is(value, -0)).toBe(false);
        }
      }),
    );
  });

  it('every number has at most 4 decimals', () => {
    fc.assert(
      fc.property(evidenceArb, (list) => {
        for (const value of numbers(aggregateV1(list))) {
          expect(Math.round(value * 1e4) / 1e4).toBe(value);
        }
      }),
    );
  });

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
        ([list, shuffled]) => {
          expect(aggregateV1(shuffled)).toEqual(aggregateV1(list));
        },
      ),
    );
  });

  it('adding evidence that does not score a dimension does not change it', () => {
    fc.assert(
      fc.property(
        evidenceArb,
        specArb,
        fc.constantFrom(...DIMENSIONS),
        (list, extra, d) => {
          const [added] = evidence([
            ...list.map(() => ({ scores: {} })),
            { ...extra, scores: { ...extra.scores, [d]: null } },
          ]).slice(-1);
          const before = aggregateV1(list);
          const after = aggregateV1([...list, added as Evidence]);
          expect(after.dimensions[d]).toBe(before.dimensions[d]);
          expect(after.perDimension[d]).toEqual(before.perDimension[d]);
        },
      ),
    );
  });

  it('computing twice gives the same bytes', () => {
    fc.assert(
      fc.property(evidenceArb, (list) => {
        expect(JSON.stringify(aggregateV1(list))).toBe(
          JSON.stringify(aggregateV1(list)),
        );
      }),
    );
  });
});
