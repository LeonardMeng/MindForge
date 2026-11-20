/** Repository 报告的一个文件问题（和 store 的 `StoreIssue` 同样的字段，core 不依赖 store）。 */
export interface RepositoryIssue {
  /** 文件相对于 Workspace 根目录的路径。 */
  readonly file: string;
  readonly code: string;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

type Params = Readonly<Record<string, string | number>>;
const text = (value: string | number | undefined): string =>
  String(value ?? '');

/**
 * Core 的错误消息表（ADR-0013）：错误码稳定，消息只从这里生成，测试只断言错误码。
 */
const MESSAGES_EN = {
  'core.concept_not_found': (p: Params) =>
    `concept "${text(p.concept_id)}" does not exist`,
  'core.concept_unreadable': (p: Params) =>
    `concept "${text(p.concept_id)}" cannot be read; fix the file first (see the issues)`,
  'core.concept_archived': (p: Params) =>
    `concept "${text(p.concept_id)}" is archived; it no longer accepts evidence`,
  'core.criteria_unreadable': (p: Params) =>
    `the assessment criteria of "${text(p.concept_id)}" cannot be read; fix the file first (see the issues)`,
  'core.dimension_not_assessed': (p: Params) =>
    `the evidence scores ${text(p.dimension)}, but the criteria of "${text(p.concept_id)}" do not assess that dimension`,
  'core.session_unreadable': (p: Params) =>
    `assessment session "${text(p.session_id)}" cannot be read; fix the file first (see the issues)`,
  'core.session_already_used': (p: Params) =>
    `assessment session "${text(p.session_id)}" already has evidence "${text(p.evidence_id)}"; each session produces one piece of evidence`,
  'core.evidence_before_session': (p: Params) =>
    `the evidence was created at ${text(p.created_at)}, before its session was completed at ${text(p.completed_at)}`,
  'core.evidence_in_future': (p: Params) =>
    `the evidence was created at ${text(p.created_at)}, more than ${text(p.tolerance_minutes)} minutes after now (${text(p.now)})`,
  'core.criteria_not_found': (p: Params) =>
    `concept "${text(p.concept_id)}" has no assessment criteria`,
  'core.criteria_version_mismatch': (p: Params) =>
    `the evidence uses criteria version ${text(p.actual)}, but the current criteria of ` +
    `"${text(p.concept_id)}" are version ${text(p.expected)}`,
  'core.session_not_found': (p: Params) =>
    `assessment session "${text(p.session_id)}" does not exist`,
  'core.session_mismatch': (p: Params) =>
    `the evidence and its session disagree on ${text(p.field)}: ` +
    `"${text(p.actual)}" in the evidence, "${text(p.expected)}" in the session`,
  'core.evidence_already_exists': (p: Params) =>
    `evidence "${text(p.evidence_id)}" already exists; evidence is never overwritten`,
  'core.evidence_invalid': () => 'the evidence is not valid; see the issues',
  'core.rules_version_unknown': (p: Params) =>
    `rules version ${text(p.version)} is not available in this version of Mastery OS`,
  'core.evidence_version_too_new': (p: Params) =>
    `concept "${text(p.concept_id)}" has ${text(p.count)} evidence file(s) written by a newer version ` +
    'of Mastery OS; upgrade Mastery OS before recomputing its mastery',
} as const satisfies Record<string, (p: Params) => string>;

/** Core 的错误码。 */
export type CoreErrorCode = keyof typeof MESSAGES_EN;

/** 所有 Core 错误码。 */
export const CORE_ERROR_CODES = Object.keys(MESSAGES_EN) as CoreErrorCode[];

/**
 * 一个领域错误：普通数据，不是异常。`message` 从消息表生成，测试只断言 `code`。
 */
export interface CoreError<C extends CoreErrorCode = CoreErrorCode> {
  readonly code: C;
  readonly params: Params;
  readonly message: string;
  /** 具体的文件问题（比如证据的校验错误）。 */
  readonly issues: readonly RepositoryIssue[];
}

/** 构造一个领域错误，消息从消息表生成。 */
export function coreError<C extends CoreErrorCode>(
  code: C,
  params: Params = {},
  issues: readonly RepositoryIssue[] = [],
): CoreError<C> {
  return { code, params, message: MESSAGES_EN[code](params), issues };
}

/** Concept 不存在。 */
export type ConceptNotFound = CoreError<'core.concept_not_found'>;
/** Concept 文件读不了（格式或校验错误）。 */
export type ConceptUnreadable = CoreError<'core.concept_unreadable'>;
/** Concept 没有评测标准。 */
export type CriteriaNotFound = CoreError<'core.criteria_not_found'>;
/** 证据用的评测标准版本不是当前版本。 */
export type CriteriaVersionMismatch =
  CoreError<'core.criteria_version_mismatch'>;
/** 证据引用的评测会话不存在。 */
export type SessionNotFound = CoreError<'core.session_not_found'>;
/** 证据和它的会话对不上（Concept、评测标准版本或打分的维度不同）。 */
export type SessionMismatch = CoreError<'core.session_mismatch'>;
/** 同一个 id 的证据已经存在（不变量 2）。 */
export type EvidenceAlreadyExists = CoreError<'core.evidence_already_exists'>;
/** 证据不符合 schema。 */
export type EvidenceInvalid = CoreError<'core.evidence_invalid'>;
/** Concept 已归档，不再接受证据。 */
export type ConceptArchived = CoreError<'core.concept_archived'>;
/** 评测标准文件读不了。 */
export type CriteriaUnreadable = CoreError<'core.criteria_unreadable'>;
/** 证据给了评测标准不考察的维度打分。 */
export type DimensionNotAssessed = CoreError<'core.dimension_not_assessed'>;
/** 证据引用的评测会话读不了。 */
export type SessionUnreadable = CoreError<'core.session_unreadable'>;
/** 这个评测会话已经有证据了（一个会话只产生一条证据）。 */
export type SessionAlreadyUsed = CoreError<'core.session_already_used'>;
/** 证据的时间早于会话完成的时间。 */
export type EvidenceBeforeSession = CoreError<'core.evidence_before_session'>;
/** 证据的时间比现在晚得太多。 */
export type EvidenceInFuture = CoreError<'core.evidence_in_future'>;
/** 要用的规则版本不存在。 */
export type RulesVersionUnknown = CoreError<'core.rules_version_unknown'>;
/** 有更新版本写的证据：不能重算（1.6 的规则，2.5 使用）。 */
export type EvidenceVersionTooNew = CoreError<'core.evidence_version_too_new'>;
