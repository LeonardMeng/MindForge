/**
 * @packageDocumentation
 * Mastery Core（ADR-0002）：纯领域逻辑，不依赖 Cordis，不做 I/O。端口、结果类型、领域错误、
 * 领域事件，以及领域操作（2.2 起：{@link submitEvidence}）。
 *
 * 子路径：`@mastery/core/testing`（测试用的内存 Repository 和事件记录器），
 * `@mastery/core/contract`（Repository 的契约测试）。
 */
export { err, ok, type Result } from './result.js';
export {
  CORE_ERROR_CODES,
  coreError,
  type ConceptArchived,
  type ConceptNotFound,
  type ConceptUnreadable,
  type CoreError,
  type CoreErrorCode,
  type CriteriaNotFound,
  type CriteriaUnreadable,
  type CriteriaVersionMismatch,
  type DimensionNotAssessed,
  type EvidenceAlreadyExists,
  type EvidenceBeforeSession,
  type EvidenceInFuture,
  type EvidenceInvalid,
  type EvidenceVersionTooNew,
  type RepositoryIssue,
  type RulesVersionUnknown,
  type SessionAlreadyUsed,
  type SessionMismatch,
  type SessionNotFound,
  type SessionUnreadable,
} from './errors.js';
export {
  EVIDENCE_CLOCK_TOLERANCE_MS,
  EVIDENCE_INPUT_FILE,
  submitEvidence,
  type SubmitEvidenceError,
} from './evidence.js';
export {
  publish,
  type DomainEvent,
  type EventSink,
  type EvidenceSubmitted,
  type MasteryChanged,
} from './events.js';
export type {
  AppendEvidenceResult,
  AppendHistoryResult,
  EvidenceList,
  Repository,
  RepositoryRead,
  UnusableEvidence,
  WriteMasteryResult,
} from './repository.js';
export type {
  Aggregate,
  DimensionAggregate,
  Ports,
  Rules,
  RulesRegistry,
} from './ports.js';
