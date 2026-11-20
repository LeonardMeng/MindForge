import type { Aggregate, DimensionAggregate } from '@mastery/core';
import { DIMENSIONS, type Dimension, type Evidence } from '@mastery/schema';

/** 一天的毫秒数。 */
export const DAY_MS = 86_400_000;

/**
 * 规则 v1 的参数（ADR-0007，**暂定**，M5 检查点后根据实际使用复审）。改动任何一个都要升级规则版本。
 */
export const V1_PARAMETERS = Object.freeze({
  /** 比这个维度最新的证据早这么多天的证据，权重减半：`H / (H + ageDays)`。 */
  halfWeightDays: 30,
  /** 评测类型的权重：独立验证 > 练习 > 自评。 */
  typeWeights: Object.freeze({
    independent_verification: 1,
    practice: 0.6,
    self_assessment: 0.3,
  } satisfies Record<Evidence['assessment_type'], number>),
  /** 输出保留的小数位数。 */
  decimals: 4,
  /** `mastered` 至少要几次通过的独立验证（只算当前 criteria 版本的）。 */
  minIndependentVerifications: 2,
  /** 通过的独立验证中，最早和最晚的至少相隔几天。 */
  minVerificationGapDays: 7,
});

const SCALE = 10 ** V1_PARAMETERS.decimals;

/** 四舍五入到 4 位小数，限制在 0..1，`-0` 写成 0。 */
function output(value: number): number {
  const rounded = Math.round(value * SCALE) / SCALE;
  const clamped = Math.min(1, Math.max(0, rounded));
  return clamped === 0 ? 0 : clamped;
}

const byId = (a: Evidence, b: Evidence) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

interface Raw {
  readonly score: number;
  readonly confidence: number;
  readonly evidenceCount: number;
}

/**
 * 一个维度的聚合（未舍入）。`list` 已按 id 排好，只包含给这个维度打了分的证据。
 *
 * 只用加减乘除和绝对值：它们在 IEEE 754 下结果唯一，不同的 JS 引擎、Node 版本算出的结果逐位相同
 * （`Math.exp`、`Math.pow`、`Math.sqrt` 等在规范里是近似的，不保证）。
 */
function aggregateDimension(
  list: readonly Evidence[],
  dimension: Dimension,
): Raw {
  const times = list.map((e) => Date.parse(e.created_at));
  // 参考时间：这个维度最新的证据（不是全部证据里最新的，也不是现在）。
  const reference = Math.max(...times);
  const H = V1_PARAMETERS.halfWeightDays;

  let totalWeight = 0;
  let weightedSum = 0;
  let certainty = 0;
  const weights: number[] = [];
  list.forEach((e, i) => {
    const ageDays = (reference - (times[i] as number)) / DAY_MS;
    const weight =
      (H / (H + ageDays)) * V1_PARAMETERS.typeWeights[e.assessment_type];
    weights.push(weight);
    totalWeight += weight;
    weightedSum += weight * (e.dimensions[dimension] as number);
    certainty += weight * e.confidence;
  });
  const score = weightedSum / totalWeight;

  let deviation = 0;
  list.forEach((e, i) => {
    deviation +=
      (weights[i] as number) *
      Math.abs((e.dimensions[dimension] as number) - score);
  });
  const consistency = Math.max(0, 1 - (2 * deviation) / totalWeight);
  const amount = certainty / (certainty + 1);

  return {
    score,
    confidence: amount * consistency,
    evidenceCount: list.length,
  };
}

/**
 * 规则 v1 的维度聚合（ADR-0007）。
 *
 * 每个维度只看给它打了分的证据（`null` 不参与）：
 * - 权重 = 时间衰减 `H / (H + ageDays)` × 评测类型权重；`ageDays` 从**这个维度**最新的证据算起；
 * - 分数 = 加权平均；
 * - 维度置信度 = 数量 `C / (C + 1)` × 一致性 `1 − 2 × 加权平均绝对偏差`，其中 `C` 是权重乘以证据自己的
 *   `confidence` 之和（证据的 `confidence` 只影响置信度，不影响分数）；
 * - 总置信度 = 有分数的维度的置信度的平均；没有证据时为 0。
 *
 * 纯函数：不读时钟，证据先按 id 排序再求和，所以顺序不影响结果（不变量 3）。所有输出四舍五入到
 * 4 位小数，不会出现 `-0`。
 *
 * @param evidence - 一个 Concept 的证据（任意顺序，不会被修改）
 */
export function aggregateV1(evidence: readonly Evidence[]): Aggregate {
  const sorted = [...evidence].sort(byId);
  const dimensions = {} as Record<Dimension, number | null>;
  const perDimension = {} as Record<Dimension, DimensionAggregate | null>;
  let confidenceSum = 0;
  let scored = 0;

  for (const dimension of DIMENSIONS) {
    const list = sorted.filter((e) => e.dimensions[dimension] !== null);
    if (list.length === 0) {
      dimensions[dimension] = null;
      perDimension[dimension] = null;
      continue;
    }
    const raw = aggregateDimension(list, dimension);
    dimensions[dimension] = output(raw.score);
    perDimension[dimension] = {
      score: output(raw.score),
      confidence: output(raw.confidence),
      evidenceCount: raw.evidenceCount,
    };
    confidenceSum += raw.confidence;
    scored += 1;
  }

  return {
    dimensions,
    confidence: scored === 0 ? 0 : output(confidenceSum / scored),
    perDimension,
  };
}
