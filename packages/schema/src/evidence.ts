import { z } from 'zod';

import { Actor } from './actor.js';
import { DimensionScores } from './dimensions.js';
import { pushIssue } from './errors.js';
import {
  NonEmptyString,
  PositiveInteger,
  SchemaVersionV1,
  UnitInterval,
} from './fields.js';
import { IsoDateTime, Slug, Ulid } from './ids.js';

/** 评测类型，权重从高到低：独立验证 > 练习 > 自评（2.3）。 */
export const AssessmentType = z.enum([
  'independent_verification',
  'practice',
  'self_assessment',
]);
/** 评测类型。 */
export type AssessmentType = z.infer<typeof AssessmentType>;

/** 评分者：agent（插件名 + 模型），或者 human（用户自评或手动录入）。和 {@link Actor} 是同一个 schema。 */
export const Evaluator = Actor;
/** 评分者。 */
export type Evaluator = Actor;

/**
 * `evidence/<concept-slug>/<ULID>.json`：一次掌握程度的证明记录。只能追加，不能修改。
 *
 * - `session_id` 和 `note` 都必须写出来，可以是 `null`。
 * - 手动录入（`session_id: null`）时，`note` 必须写明来由；有会话时评分理由在会话里。
 * - 五个维度不能全是 `null`。
 * - 一次评测会话只对应一条 Evidence，由 Evidence 通过 `session_id` 指回会话。
 */
export const Evidence = z
  .strictObject({
    schema_version: SchemaVersionV1,
    id: Ulid,
    concept_id: Slug,
    session_id: Ulid.nullable(),
    assessment_type: AssessmentType,
    /** 评测时使用的 criteria 版本。 */
    criteria_version: PositiveInteger,
    dimensions: DimensionScores,
    confidence: UnitInterval,
    evaluator: Evaluator,
    note: NonEmptyString.nullable(),
    created_at: IsoDateTime,
  })
  .check((ctx) => {
    if (Object.values(ctx.value.dimensions).every((score) => score === null)) {
      pushIssue(ctx, 'evidence.no_dimensions', {}, ['dimensions']);
    }
    if (ctx.value.session_id === null && ctx.value.note === null) {
      pushIssue(ctx, 'evidence.note_required', {}, ['note']);
    }
  });
/** 一条 Evidence。 */
export type Evidence = z.infer<typeof Evidence>;
