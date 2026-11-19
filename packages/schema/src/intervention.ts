import { z } from 'zod';

import { Actor } from './actor.js';
import { pushIssue } from './errors.js';
import { NonEmptyString, SchemaVersionV1 } from './fields.js';
import { IsoDateTime, Ulid } from './ids.js';

/** 教学方法（7.2）：讲解、苏格拉底式提问、练习、反例。 */
export const InterventionMethod = z.enum([
  'explanation',
  'socratic',
  'practice',
  'counterexample',
]);
/** 教学方法。 */
export type InterventionMethod = z.infer<typeof InterventionMethod>;

/** 干预的状态。没有删除：不再需要的干预标为 `abandoned`。 */
export const InterventionStatus = z.enum(['planned', 'completed', 'abandoned']);
/** 干预的状态。 */
export type InterventionStatus = z.infer<typeof InterventionStatus>;

/**
 * `interventions/<ULID>.yaml`：针对某个盲区设计的学习活动。文件可以修改。
 *
 * - 不写 `concept_id`：盲区里已经有了，写两遍可能对不上。
 * - `closed_at` 必须写出来：`planned` 时为 `null`；`completed` 或 `abandoned` 时为结束时间，
 *   不能早于 `created_at`。
 * - 完成后的验证证据怎么关联，留到 7.2 决定。
 */
export const Intervention = z
  .strictObject({
    schema_version: SchemaVersionV1,
    id: Ulid,
    blindspot_id: Ulid,
    method: InterventionMethod,
    /** 学习活动本身（Markdown）。 */
    content: NonEmptyString,
    status: InterventionStatus,
    closed_at: IsoDateTime.nullable(),
    source: Actor,
    created_at: IsoDateTime,
  })
  .check((ctx) => {
    const { status, closed_at, created_at } = ctx.value;
    if (status === 'planned') {
      if (closed_at !== null) {
        pushIssue(ctx, 'intervention.closed_at_not_allowed', {}, ['closed_at']);
      }
    } else if (closed_at === null) {
      pushIssue(ctx, 'intervention.closed_at_required', { status }, [
        'closed_at',
      ]);
    } else if (closed_at < created_at) {
      // IsoDateTime 只有一种写法，可以直接按字符串比较先后。
      pushIssue(
        ctx,
        'intervention.closed_before_created',
        { closed_at, created_at },
        ['closed_at'],
      );
    }
  });
/** 一个干预。 */
export type Intervention = z.infer<typeof Intervention>;
