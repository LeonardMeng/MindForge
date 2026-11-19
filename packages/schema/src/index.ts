/**
 * @packageDocumentation
 * Mastery OS 的文件协议：zod schema、推导出的类型和结构化的校验错误。
 *
 * 本包是纯定义：不依赖任何内部包，不做 I/O，不依赖 Node（ADR-0012）。
 * 校验数据时推荐用 {@link validate}，它返回结构化的错误。
 */

export {
  formatSchemaError,
  formatSchemaIssue,
  SCHEMA_ERROR_CODES,
  toSchemaIssues,
  validate,
  type SchemaErrorCode,
  type SchemaErrorParams,
  type SchemaIssue,
  type ValidationResult,
} from './errors.js';
export {
  formatGlobalConceptRef,
  GlobalConceptRef,
  IsoDateTime,
  parseGlobalConceptRef,
  SchemaVersion,
  Slug,
  Ulid,
} from './ids.js';
export {
  DIMENSIONS,
  DimensionScore,
  DimensionScores,
  type Dimension,
} from './dimensions.js';
export { WorkspaceConfig } from './workspace.js';
export { ProjectConfig, ProjectStatus } from './project.js';
export {
  ConceptFrontmatter,
  conceptFrontmatterWarnings,
  ConceptStatus,
} from './concept.js';
export { parseConceptBody, type ConceptBody } from './concept-body.js';
export { Criteria, CriterionDimension } from './criteria.js';
export { AssessmentItem, AssessmentSession } from './session.js';
export { AssessmentType, Evaluator, Evidence } from './evidence.js';
export { Actor, ModelRef } from './actor.js';
export { Blindspot, BlindspotStatus, BlindspotType } from './blindspot.js';
export {
  Intervention,
  InterventionMethod,
  InterventionStatus,
} from './intervention.js';
export {
  PROPOSAL_OPERATIONS,
  Proposal,
  ProposalOperation,
} from './proposal.js';
export {
  ExplanationItem,
  MASTERY_STATES,
  MasteryChangeCause,
  MasteryHistoryEntry,
  MasteryProjection,
  MasteryState,
} from './mastery.js';
