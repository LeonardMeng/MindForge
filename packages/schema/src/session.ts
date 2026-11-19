import { z } from 'zod';

import { DIMENSIONS, DimensionScores } from './dimensions.js';
import { pushIssue } from './errors.js';
import {
  listOf,
  NonEmptyString,
  PositiveInteger,
  SchemaVersionV1,
} from './fields.js';
import { IsoDateTime, Slug, Ulid } from './ids.js';

/**
 * 评测会话里的一道题。
 *
 * `scores` 是这道题的原始分数，五个维度写全；值不为 `null` 的维度必须在 `dimensions` 里。
 * 会话写完就不能再改，所以每道题的分数必须在这里记下来。
 */
export const AssessmentItem = z
  .strictObject({
    /** 这道题考察的维度，不能为空、不能重复。 */
    dimensions: listOf('dimensions', z.enum(DIMENSIONS), { nonEmpty: true }),
    question: NonEmptyString,
    /** 学习者的回答；什么都没答时是空字符串。 */
    answer: z.string(),
    /** 评分理由。 */
    rationale: NonEmptyString,
    scores: DimensionScores,
  })
  .check((ctx) => {
    for (const dimension of DIMENSIONS) {
      if (
        ctx.value.scores[dimension] !== null &&
        !ctx.value.dimensions.includes(dimension)
      ) {
        pushIssue(ctx, 'session.score_outside_dimensions', { dimension }, [
          'scores',
          dimension,
        ]);
      }
    }
  });
/** 评测会话里的一道题。 */
export type AssessmentItem = z.infer<typeof AssessmentItem>;

/**
 * `assessments/<concept-slug>/sessions/<ULID>.json`：一次完成的评测会话。只能追加，不能修改。
 *
 * - 会话完成时一次写入，没有“进行中”的状态；中途放弃的会话不保存。
 * - 一次会话只对应一条 Evidence，会话里不记录 Evidence 的 id，由 Evidence 通过 `session_id` 指回会话。
 * - 每道题的汇总规则（Evidence 里的分数怎么从各题分数得出）属于 2.3 和 5.2。
 */
export const AssessmentSession = z
  .strictObject({
    schema_version: SchemaVersionV1,
    id: Ulid,
    concept_id: Slug,
    criteria_version: PositiveInteger,
    started_at: IsoDateTime,
    completed_at: IsoDateTime,
    items: listOf('items', AssessmentItem, { nonEmpty: true, unique: false }),
  })
  .check((ctx) => {
    // IsoDateTime 只有一种写法，可以直接按字符串比较先后。
    if (ctx.value.completed_at < ctx.value.started_at) {
      pushIssue(
        ctx,
        'session.completed_before_started',
        {
          started_at: ctx.value.started_at,
          completed_at: ctx.value.completed_at,
        },
        ['completed_at'],
      );
    }
  });
/** 一次评测会话。 */
export type AssessmentSession = z.infer<typeof AssessmentSession>;
