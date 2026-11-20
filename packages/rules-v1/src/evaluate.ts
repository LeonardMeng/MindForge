import type { Aggregate, Evaluation, EvaluationStep } from '@mastery/core';
import {
  DIMENSIONS,
  type Criteria,
  type Dimension,
  type Evidence,
  type ExplanationItem,
  type MasteryState,
} from '@mastery/schema';

import { aggregateV1, DAY_MS, V1_PARAMETERS } from './aggregate.js';

/** 按 `(created_at, id)` 排序：状态机处理证据的顺序。 */
const byTime = (a: Evidence, b: Evidence) =>
  a.created_at < b.created_at
    ? -1
    : a.created_at > b.created_at
      ? 1
      : a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0;

/** criteria 考察的维度（不是 `null` 的），按 DIMENSIONS 的顺序。 */
function assessedDimensions(criteria: Criteria): Dimension[] {
  return DIMENSIONS.filter((d) => criteria.dimensions[d] !== null);
}

const thresholdOf = (criteria: Criteria, d: Dimension) =>
  (criteria.dimensions[d] as { readonly threshold: number }).threshold;

/**
 * 通过的独立验证：类型是独立验证、用的是**当前** criteria 版本、至少给一个考察的维度打了分，
 * 而且它给考察的维度打的分都达到阈值。
 */
export function isPassingVerification(
  e: Evidence,
  criteria: Criteria,
): boolean {
  if (e.assessment_type !== 'independent_verification') return false;
  if (e.criteria_version !== criteria.version) return false;
  const scored = assessedDimensions(criteria).filter(
    (d) => e.dimensions[d] !== null,
  );
  return (
    scored.length > 0 &&
    scored.every((d) => (e.dimensions[d] as number) >= thresholdOf(criteria, d))
  );
}

/** 一组证据（某一步之前的全部证据）满足了哪些条件。 */
export interface Conditions {
  readonly aggregate: Aggregate;
  /** 考察的维度里还没有分数的。 */
  readonly untested: readonly Dimension[];
  /** 考察的维度里分数低于阈值的。 */
  readonly below: readonly Dimension[];
  /** 通过的独立验证，按 `(created_at, id)` 排序。 */
  readonly passing: readonly Evidence[];
  /** 通过的独立验证中最早和最晚相隔的毫秒数（少于两次时为 0）。 */
  readonly gapMs: number;
  /** 考察的维度里，没有任何通过的独立验证给它打过分的。 */
  readonly uncovered: readonly Dimension[];
  /** P：可以算 `provisional_mastery`。 */
  readonly provisional: boolean;
  /** M：可以算 `mastered`（包含 P）。 */
  readonly mastered: boolean;
}

/**
 * 计算条件 P 和 M（ADR-0007 第 2.4 节）。
 *
 * - P：每个考察的维度的聚合分数都达到阈值（没测过的维度不算达到），并且至少有一次通过的独立验证。
 * - M：P，并且至少 2 次通过的独立验证，最早和最晚相隔至少 7 天，而且每个考察的维度都被某次通过的
 *   独立验证打过分（criteria 考察 transfer 时，这就要求 transfer 也被独立验证过）。
 *
 * @param evidence - 已按 `(created_at, id)` 排序的证据
 * @param criteria - 当前的评测标准
 */
export function conditionsOf(
  evidence: readonly Evidence[],
  criteria: Criteria,
): Conditions {
  const aggregate = aggregateV1(evidence);
  const assessed = assessedDimensions(criteria);
  const untested = assessed.filter((d) => aggregate.dimensions[d] === null);
  const below = assessed.filter((d) => {
    const score = aggregate.dimensions[d];
    return score !== null && score < thresholdOf(criteria, d);
  });
  const passing = evidence.filter((e) => isPassingVerification(e, criteria));
  const first = passing[0];
  const last = passing[passing.length - 1];
  const gapMs =
    first === undefined || last === undefined
      ? 0
      : Date.parse(last.created_at) - Date.parse(first.created_at);
  const uncovered = assessed.filter(
    (d) => !passing.some((e) => e.dimensions[d] !== null),
  );
  const provisional =
    untested.length === 0 && below.length === 0 && passing.length >= 1;
  const mastered =
    provisional &&
    passing.length >= V1_PARAMETERS.minIndependentVerifications &&
    gapMs >= V1_PARAMETERS.minVerificationGapDays * DAY_MS &&
    uncovered.length === 0;
  return {
    aggregate,
    untested,
    below,
    passing,
    gapMs,
    uncovered,
    provisional,
    mastered,
  };
}

/**
 * 一步状态迁移（ADR-0007 第 2.4 节的表）。`e` 是这一步的证据，`c` 是到它为止的条件。
 * 进入 `mastered` 总是要求 `e` 本身是一次通过的独立验证。
 */
function next(
  state: MasteryState,
  c: Conditions,
  e: Evidence,
  criteria: Criteria,
): MasteryState {
  const passingNow = isPassingVerification(e, criteria);
  switch (state) {
    case 'mastered':
      return c.provisional ? 'mastered' : 'needs_review';
    case 'needs_review':
      if (c.mastered && passingNow) return 'mastered';
      if (c.provisional) return 'needs_review';
      return e.assessment_type === 'independent_verification'
        ? 'learning'
        : 'needs_review';
    default:
      if (c.mastered && passingNow) return 'mastered';
      if (c.provisional) return 'provisional_mastery';
      return state === 'not_assessed' ? 'diagnosed' : 'learning';
  }
}

const item = (
  code: string,
  params: Record<string, unknown> = {},
): ExplanationItem => ({
  code,
  params,
});

/** 为什么是这个状态、还差什么。顺序：状态，已满足的，还差的（维度按 DIMENSIONS 的顺序）。 */
function explain(
  state: MasteryState,
  c: Conditions,
  criteria: Criteria,
): ExplanationItem[] {
  const items: ExplanationItem[] = [item(`state.${state}`)];
  if (c.passing.length > 0) {
    items.push(
      item('met.independent_verifications', { count: c.passing.length }),
    );
  }
  if (state === 'mastered') return items;

  if (!c.provisional) {
    for (const dimension of c.untested)
      items.push(item('missing.untested', { dimension }));
    for (const dimension of c.below) {
      items.push(
        item('missing.below_threshold', {
          dimension,
          score: c.aggregate.dimensions[dimension],
          threshold: thresholdOf(criteria, dimension),
        }),
      );
    }
    if (c.passing.length === 0) {
      items.push(
        item('missing.independent_verifications', { have: 0, need: 1 }),
      );
    }
    return items;
  }

  if (c.mastered) {
    // 条件都满足了，但进入 mastered 要等下一次通过的独立验证。
    items.push(item('missing.reverification'));
    return items;
  }
  const need = V1_PARAMETERS.minIndependentVerifications;
  if (c.passing.length < need) {
    items.push(
      item('missing.independent_verifications', {
        have: c.passing.length,
        need,
      }),
    );
  } else if (c.gapMs < V1_PARAMETERS.minVerificationGapDays * DAY_MS) {
    items.push(
      item('missing.spacing', {
        days: Math.floor(c.gapMs / DAY_MS),
        need: V1_PARAMETERS.minVerificationGapDays,
      }),
    );
  }
  for (const dimension of c.uncovered) {
    items.push(item('missing.verification_coverage', { dimension }));
  }
  return items;
}

/**
 * 规则 v1 的状态机（ADR-0007 第 2.4 节）。按 `(created_at, id)` 的顺序逐条处理证据，从
 * `not_assessed` 开始，每一步根据到这条证据为止的条件 P、M 和这条证据本身决定下一个状态。
 * 纯函数：不读时钟，输入顺序不影响结果。到期复习（`mastered` 因为时间变成 `needs_review`）不在这里（2.7）。
 *
 * @param evidence - 一个 Concept 的证据（任意顺序，不会被修改）
 * @param criteria - 当前的评测标准
 */
export function evaluateV1(
  evidence: readonly Evidence[],
  criteria: Criteria,
): Evaluation {
  const sorted = [...evidence].sort(byTime);
  const steps: EvaluationStep[] = [];
  let state: MasteryState = 'not_assessed';
  let conditions = conditionsOf([], criteria);
  sorted.forEach((e, i) => {
    conditions = conditionsOf(sorted.slice(0, i + 1), criteria);
    const to = next(state, conditions, e, criteria);
    steps.push({
      from: state,
      to,
      evidenceId: e.id,
      at: e.created_at,
      dimensions: conditions.aggregate.dimensions,
      confidence: conditions.aggregate.confidence,
    });
    state = to;
  });
  return {
    state,
    aggregate: conditions.aggregate,
    explanation: explain(state, conditions, criteria),
    steps,
  };
}
