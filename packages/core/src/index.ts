/**
 * @packageDocumentation
 * Mastery Core（ADR-0002）：纯领域逻辑，不依赖 Cordis，不做 I/O。2.1 只有端口、结果类型、
 * 领域错误和领域事件；逻辑从 2.2 开始。
 *
 * 子路径：`@mastery/core/testing`（测试用的内存 Repository 和事件记录器），
 * `@mastery/core/contract`（Repository 的契约测试）。
 */
export { err, ok, type Result } from './result.js';
export {
  CORE_ERROR_CODES,
  coreError,
  type ConceptNotFound,
  type ConceptUnreadable,
  type CoreError,
  type CoreErrorCode,
  type CriteriaNotFound,
  type CriteriaVersionMismatch,
  type EvidenceAlreadyExists,
  type EvidenceInvalid,
  type EvidenceVersionTooNew,
  type RepositoryIssue,
  type RulesVersionUnknown,
  type SessionMismatch,
  type SessionNotFound,
} from './errors.js';
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
export type { Ports, Rules, RulesRegistry } from './ports.js';
