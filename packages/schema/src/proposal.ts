import { z } from 'zod';

import { Actor } from './actor.js';
import { Blindspot } from './blindspot.js';
import { ConceptFrontmatter } from './concept.js';
import { Criteria } from './criteria.js';
import { pushIssue } from './errors.js';
import { listOf, NonEmptyString, taggedUnion } from './fields.js';
import { schemaVersionOf } from './versions.js';
import { IsoDateTime, Slug, Ulid } from './ids.js';
import { Intervention } from './intervention.js';

const ConceptCreate = z.strictObject({
  op: z.literal('concept.create'),
  frontmatter: ConceptFrontmatter,
  body: z.string(),
});

const ConceptUpdate = z
  .strictObject({
    op: z.literal('concept.update'),
    concept_id: Slug,
    /** 完整的新 frontmatter；`id` 必须等于 `concept_id`（Concept 的 id 不能改）。 */
    frontmatter: ConceptFrontmatter,
    /** 完整的新正文。 */
    body: z.string(),
  })
  .check((ctx) => {
    if (ctx.value.frontmatter.id !== ctx.value.concept_id) {
      pushIssue(
        ctx,
        'proposal.concept_id_mismatch',
        { concept_id: ctx.value.concept_id, id: ctx.value.frontmatter.id },
        ['frontmatter', 'id'],
      );
    }
  });

const CriteriaSet = z.strictObject({
  op: z.literal('criteria.set'),
  /** 完整的 Criteria（新建，或者发布新版本）。 */
  criteria: Criteria,
});

const BlindspotCreate = z.strictObject({
  op: z.literal('blindspot.create'),
  blindspot: Blindspot,
});

const BlindspotUpdate = z.strictObject({
  op: z.literal('blindspot.update'),
  /** 完整的新内容。 */
  blindspot: Blindspot,
});

const BlindspotMerge = z
  .strictObject({
    op: z.literal('blindspot.merge'),
    /** 合并到哪个盲区。 */
    target_id: Ulid,
    /** 被合并的盲区，不能为空、不能重复、不能包含 target。 */
    source_ids: listOf('source_ids', Ulid, { nonEmpty: true }),
  })
  .check((ctx) => {
    const index = ctx.value.source_ids.indexOf(ctx.value.target_id);
    if (index !== -1) {
      pushIssue(
        ctx,
        'proposal.merge_includes_target',
        { value: ctx.value.target_id },
        ['source_ids', index],
      );
    }
  });

const InterventionCreate = z.strictObject({
  op: z.literal('intervention.create'),
  intervention: Intervention,
});

const InterventionUpdate = z.strictObject({
  op: z.literal('intervention.update'),
  /** 完整的新内容。 */
  intervention: Intervention,
});

const VARIANTS = {
  'concept.create': ConceptCreate,
  'concept.update': ConceptUpdate,
  'criteria.set': CriteriaSet,
  'blindspot.create': BlindspotCreate,
  'blindspot.update': BlindspotUpdate,
  'blindspot.merge': BlindspotMerge,
  'intervention.create': InterventionCreate,
  'intervention.update': InterventionUpdate,
} as const;

/** Proposal 支持的全部变更操作。 */
export const PROPOSAL_OPERATIONS = Object.keys(
  VARIANTS,
) as readonly (keyof typeof VARIANTS)[];

/**
 * 一个变更操作，按 `op` 区分。更新类操作给出**完整的新内容**，不用补丁；
 * 内容用对应实体的 schema 校验。
 */
export const ProposalOperation = taggedUnion(
  'op',
  VARIANTS,
  z.discriminatedUnion('op', [
    ConceptCreate,
    ConceptUpdate,
    CriteriaSet,
    BlindspotCreate,
    BlindspotUpdate,
    BlindspotMerge,
    InterventionCreate,
    InterventionUpdate,
  ]),
);
/** 一个变更操作。 */
export type ProposalOperation = z.infer<typeof ProposalOperation>;

/**
 * 变更提案：agent（或用户）提交给 knowledge 服务的一组变更操作。
 * agent 不能直接写文件，只能提交 Proposal（README 第 3、4 节）。
 *
 * - **没有删除操作**。Concept、Blindspot、Intervention 都只能通过状态归档：
 *   Concept 设为 `archived`，Blindspot 设为 `resolved`，Intervention 设为 `abandoned`。
 * - Evidence 不走 Proposal（用 `submitEvidence()`）；掌握度只能由 Mastery Core 计算（不变量 4）；
 *   用户的笔记不通过 Proposal 修改。
 * - 不带审批状态：待审批、已接受、已拒绝属于审批队列（4.2 / 6.8），不属于提案本身。
 * - 提案时文件已被改动（并发冲突）怎么处理，留到 4.2。
 */
export const Proposal = z.strictObject({
  schema_version: schemaVersionOf('proposal'),
  id: Ulid,
  created_at: IsoDateTime,
  source: Actor,
  /** 产生这个提案的 agent 运行记录（4.5）；用户直接提交时为 `null`。 */
  run_id: Ulid.nullable(),
  /** 为什么提这个变更。 */
  summary: NonEmptyString,
  /**
   * 提交者是否**请求**人工审批。
   *
   * 这只是请求，不是决定：Core（4.2）按规则判断，只能把 `false` 升级为 `true`，
   * 不能把 `true` 降为 `false`。agent 不能靠填 `false` 绕过对“修改 Concept 定义”等变更的审批。
   */
  requires_approval: z.boolean(),
  operations: listOf('operations', ProposalOperation, { nonEmpty: true }),
});
/** 一个变更提案。 */
export type Proposal = z.infer<typeof Proposal>;
