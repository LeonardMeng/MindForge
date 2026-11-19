import { z } from 'zod';

import { UNIT_INTERVAL, UNIT_INTERVAL_META } from './constraints.js';
import { pushIssue } from './errors.js';

/** 掌握度的五个评估维度，按 README 的顺序。 */
export const DIMENSIONS = [
  'recall',
  'understanding',
  'reasoning',
  'application',
  'transfer',
] as const;

/** 掌握度的评估维度。 */
export type Dimension = (typeof DIMENSIONS)[number];

/**
 * 单个维度的得分：`0..1` 的有限数，或者 `null`。
 *
 * `null` 表示**没有测过**，和 `0`（测过、得分为零）是两回事。
 */
export const DimensionScore = z
  .number()
  .check((ctx) => {
    if (ctx.value < UNIT_INTERVAL.min || ctx.value > UNIT_INTERVAL.max) {
      pushIssue(ctx, 'dimension_score.out_of_range', { value: ctx.value });
    }
  })
  .meta(UNIT_INTERVAL_META)
  .nullable();
/** 单个维度的得分。 */
export type DimensionScore = z.infer<typeof DimensionScore>;

/**
 * 五个维度的得分。五个维度必须全部写出，没测过写 `null`；不允许出现其他字段。
 */
export const DimensionScores = z.strictObject({
  recall: DimensionScore,
  understanding: DimensionScore,
  reasoning: DimensionScore,
  application: DimensionScore,
  transfer: DimensionScore,
});
/** 五个维度的得分。 */
export type DimensionScores = z.infer<typeof DimensionScores>;
