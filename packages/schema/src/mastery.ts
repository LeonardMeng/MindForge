import { z } from 'zod';

import { EXPLANATION_CODE_PATTERN, patternMeta } from './constraints.js';
import { DimensionScores } from './dimensions.js';
import { pushIssue } from './errors.js';
import {
  EvidenceIds,
  listOf,
  PositiveInteger,
  taggedUnion,
  UnitInterval,
} from './fields.js';
import { schemaVersionOf } from './versions.js';
import { IsoDateTime, Slug, Ulid } from './ids.js';

/** 六个掌握状态，按 README 的顺序。 */
export const MASTERY_STATES = [
  'not_assessed',
  'diagnosed',
  'learning',
  'provisional_mastery',
  'mastered',
  'needs_review',
] as const;

/** 掌握状态（和 Concept 的 status 是两回事）。 */
export const MasteryState = z.enum(MASTERY_STATES);
/** 掌握状态。 */
export type MasteryState = z.infer<typeof MasteryState>;

/**
 * explanation 的一项：和结构化错误一样，是 `code` + `params`（ADR-0013）。
 * 具体有哪些 code、对应什么文字，由规则包（rules-v1，2.4）定义；schema 只校验结构。
 */
export const ExplanationItem = z.strictObject({
  code: z
    .string()
    .check((ctx) => {
      if (!EXPLANATION_CODE_PATTERN.test(ctx.value)) {
        pushIssue(ctx, 'explanation.invalid_code', { value: ctx.value });
      }
    })
    .meta(patternMeta(EXPLANATION_CODE_PATTERN)),
  params: z.record(z.string(), z.unknown()),
});
/** explanation 的一项。 */
export type ExplanationItem = z.infer<typeof ExplanationItem>;

/**
 * `mastery/<concept-slug>.yaml`：由 Mastery Core 根据证据和规则算出的掌握度投影。
 *
 * 派生数据，手工修改会被重算覆盖。不带计算时间：同一组证据加同一版本的规则，
 * 投影必须逐字节相同（不变量 3）。下次复习日期留到 2.7 再加。
 */
export const MasteryProjection = z.strictObject({
  schema_version: schemaVersionOf('mastery-projection'),
  concept_id: Slug,
  state: MasteryState,
  dimensions: DimensionScores,
  confidence: UnitInterval,
  rules_version: PositiveInteger,
  evidence_ids: EvidenceIds,
  explanation: listOf('explanation', ExplanationItem),
});
/** 掌握度投影。 */
export type MasteryProjection = z.infer<typeof MasteryProjection>;

const EvidenceCause = z.strictObject({
  kind: z.literal('evidence'),
  evidence_id: Ulid,
});
const TimeCause = z.strictObject({ kind: z.literal('time') });
const RulesCause = z.strictObject({ kind: z.literal('rules') });

/**
 * 掌握度变化的原因：
 *
 * - `evidence`：有了新证据，`at` 取这条证据的 `created_at`；
 * - `time`：到期（例如 `mastered` 到期变成 `needs_review`），`at` 取算出来的到期时刻；
 * - `rules`：规则升级后重算，`at` 怎么确定到 3.7 再决定。
 */
export const MasteryChangeCause = taggedUnion(
  'kind',
  { evidence: EvidenceCause, time: TimeCause, rules: RulesCause },
  z.discriminatedUnion('kind', [EvidenceCause, TimeCause, RulesCause]),
);
/** 掌握度变化的原因。 */
export type MasteryChangeCause = z.infer<typeof MasteryChangeCause>;

/**
 * `mastery/history/<concept-slug>.jsonl` 的一行：一次掌握度变化后的状态。历史是派生数据，由 Mastery Core
 * 根据证据推导、整个写出（2.5），不是只追加的。
 *
 * 每一行都带 `schema_version`，单独一行也能读懂。`at` 由证据和规则推导，不取“发现变化的时间”。
 */
export const MasteryHistoryEntry = z.strictObject({
  schema_version: schemaVersionOf('mastery-history-entry'),
  at: IsoDateTime,
  state: MasteryState,
  dimensions: DimensionScores,
  confidence: UnitInterval,
  rules_version: PositiveInteger,
  cause: MasteryChangeCause,
});
/** 掌握度历史的一行。 */
export type MasteryHistoryEntry = z.infer<typeof MasteryHistoryEntry>;
