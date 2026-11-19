import { z } from 'zod';

import { pushIssue } from './errors.js';
import {
  listOf,
  NonEmptyString,
  PositiveInteger,
  SchemaVersionV1,
  UnitInterval,
} from './fields.js';
import { Slug } from './ids.js';

/** 一个维度的评测标准：考察要点（不能为空）和达标阈值。 */
export const CriterionDimension = z.strictObject({
  /** 考察要点。 */
  focus: listOf('focus', NonEmptyString, { nonEmpty: true }),
  /** 达标阈值，`0..1`。 */
  threshold: UnitInterval,
});
/** 一个维度的评测标准。 */
export type CriterionDimension = z.infer<typeof CriterionDimension>;

const CriterionOrNull = CriterionDimension.nullable();

/**
 * `assessments/<concept-slug>/criteria.yaml`：某个 Concept 的评测标准。
 *
 * - `version` 是这份标准的版本，每条 Evidence 都记录评测时用的版本（`criteria_version`）。
 * - 五个维度都要写出来，不考察的维度写 `null`；至少要考察一个维度。
 * - `concept_id` 是否和目录名一致，由 `mastery validate` 检查。
 */
export const Criteria = z.strictObject({
  schema_version: SchemaVersionV1,
  concept_id: Slug,
  version: PositiveInteger,
  dimensions: z
    .strictObject({
      recall: CriterionOrNull,
      understanding: CriterionOrNull,
      reasoning: CriterionOrNull,
      application: CriterionOrNull,
      transfer: CriterionOrNull,
    })
    .check((ctx) => {
      if (Object.values(ctx.value).every((criterion) => criterion === null)) {
        pushIssue(ctx, 'criteria.no_dimensions', {});
      }
    }),
});
/** `criteria.yaml` 的内容。 */
export type Criteria = z.infer<typeof Criteria>;
