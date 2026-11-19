import { z } from 'zod';

import { Actor } from './actor.js';
import { pushIssue } from './errors.js';
import { EvidenceIds, NonEmptyString, SchemaVersionV1 } from './fields.js';
import { IsoDateTime, Slug, Ulid } from './ids.js';

/** 盲区的类型。 */
export const BlindspotType = z.enum([
  'knowledge',
  'reasoning',
  'application',
  'prerequisite',
  'retention',
]);
/** 盲区的类型。 */
export type BlindspotType = z.infer<typeof BlindspotType>;

/**
 * 盲区的状态。没有删除操作。
 *
 * - `resolved`：缺口已经补上了。
 * - `merged`：并入了另一个盲区（见 `merged_into`）。不能用 `resolved` 表示合并，否则统计会出错。
 */
export const BlindspotStatus = z.enum([
  'suspected',
  'confirmed',
  'resolved',
  'merged',
]);
/** 盲区的状态。 */
export type BlindspotStatus = z.infer<typeof BlindspotStatus>;

/**
 * `blindspots/<ULID>.yaml`：怀疑或已确认的知识缺口、误解或薄弱点。文件可以修改（状态会变化），
 * 状态的变化过程由 Git 历史记录。
 *
 * - `prerequisite_id` 必须写出来：`type` 为 `prerequisite` 时是缺失的前置 Concept（本 Workspace 的
 *   slug，不能是 `concept_id` 自己），其他类型必须是 `null`。
 * - `evidence_ids` 是支持这个判断的证据，升序、不重复，可以是 `[]`（用户手动记下的盲区）。
 * - `merged_into` 必须写出来：`status` 为 `merged` 时是并入的那个盲区（不能是自己），其他状态必须是 `null`。
 *   指向的盲区是否存在、有没有形成合并链或循环，由 Core 检查（4.2）。
 */
export const Blindspot = z
  .strictObject({
    schema_version: SchemaVersionV1,
    id: Ulid,
    /** 在哪个 Concept 上发现的盲区。 */
    concept_id: Slug,
    type: BlindspotType,
    status: BlindspotStatus,
    /** 缺口或误解是什么。 */
    description: NonEmptyString,
    prerequisite_id: Slug.nullable(),
    merged_into: Ulid.nullable(),
    evidence_ids: EvidenceIds,
    source: Actor,
    created_at: IsoDateTime,
  })
  .check((ctx) => {
    const { id, status, merged_into, type, prerequisite_id, concept_id } =
      ctx.value;
    if (status === 'merged' && merged_into === null) {
      pushIssue(ctx, 'blindspot.merged_into_required', {}, ['merged_into']);
    } else if (status !== 'merged' && merged_into !== null) {
      pushIssue(ctx, 'blindspot.merged_into_not_allowed', { status }, [
        'merged_into',
      ]);
    } else if (merged_into === id) {
      pushIssue(ctx, 'blindspot.merged_into_self', {}, ['merged_into']);
    }
    if (type === 'prerequisite' && prerequisite_id === null) {
      pushIssue(ctx, 'blindspot.prerequisite_required', {}, [
        'prerequisite_id',
      ]);
    } else if (type !== 'prerequisite' && prerequisite_id !== null) {
      pushIssue(ctx, 'blindspot.prerequisite_not_allowed', { type }, [
        'prerequisite_id',
      ]);
    } else if (prerequisite_id === concept_id) {
      pushIssue(ctx, 'blindspot.prerequisite_is_self', { value: concept_id }, [
        'prerequisite_id',
      ]);
    }
  });
/** 一个盲区。 */
export type Blindspot = z.infer<typeof Blindspot>;
