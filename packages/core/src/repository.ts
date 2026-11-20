import type {
  AssessmentSession,
  ConceptFrontmatter,
  Criteria,
  Evidence,
  MasteryHistoryEntry,
  MasteryProjection,
} from '@mastery/schema';

import type { RepositoryIssue } from './errors.js';

/**
 * 读取一个文件的结果：
 * - `found`：读到并通过了校验；
 * - `missing`：文件不存在；
 * - `unreadable`：文件在，但用不了。`tooNew` 表示它是更新版本的 Mastery OS 写的（只能读，不能改）。
 */
export type RepositoryRead<T> =
  | { readonly kind: 'found'; readonly value: T }
  | { readonly kind: 'missing' }
  | {
      readonly kind: 'unreadable';
      readonly tooNew: boolean;
      readonly issues: readonly RepositoryIssue[];
    };

/** 一个用不了的证据文件。 */
export interface UnusableEvidence {
  /** 文件位置。 */
  readonly file: string;
  /** 证据 id（文件名不是合法 ULID 时为 null）。 */
  readonly id: string | null;
  readonly issues: readonly RepositoryIssue[];
}

/**
 * 一个 Concept 的全部证据。**不会悄悄丢掉用不了的文件**：版本过新的、读不了的都单独列出来，
 * 2.5 据此决定能不能重算（有版本过新的证据时不重算，见 1.6 的规则）。
 */
export interface EvidenceList {
  /** 能用的证据，按 id 升序（ULID 的顺序就是时间顺序）。 */
  readonly items: readonly Evidence[];
  /** 更新版本的 Mastery OS 写的证据，按文件名排序。 */
  readonly tooNew: readonly UnusableEvidence[];
  /** 读不了的证据（格式错误、校验失败、文件名不对等），按文件名排序。 */
  readonly unreadable: readonly UnusableEvidence[];
}

/** 追加证据的结果。 */
export type AppendEvidenceResult =
  | { readonly ok: true }
  /** 同一个 id 的证据已经存在，什么都没写。 */
  | { readonly ok: false; readonly reason: 'exists' }
  /** 不符合 schema，什么都没写。 */
  | {
      readonly ok: false;
      readonly reason: 'invalid';
      readonly issues: readonly RepositoryIssue[];
    };

/** 写掌握度投影的结果。 */
export type WriteMasteryResult =
  /** `written`：内容没变时为 false，文件不动。 */
  | { readonly ok: true; readonly written: boolean }
  /** 原文件是更新版本写的，拒绝覆盖；或者投影本身不符合 schema。 */
  | {
      readonly ok: false;
      readonly reason: 'too_new' | 'invalid';
      readonly issues: readonly RepositoryIssue[];
    };

/** 追加一条掌握度历史的结果。 */
export type AppendHistoryResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      /** `too_new`：已有的行是更新版本写的；`unreadable`：已有的行有问题；`invalid`：新的一行不符合 schema。 */
      readonly reason: 'too_new' | 'unreadable' | 'invalid';
      readonly issues: readonly RepositoryIssue[];
    };

/**
 * Core 看到的 Workspace 数据（端口）。只有 2.2 和 2.5 需要的操作，以后的任务需要时再加。
 *
 * 实现：`@mastery/core-store` 的 `createStoreRepository`（基于 store，2.2），测试用的内存实现
 * `@mastery/core/testing`。两个都要通过 `@mastery/core/contract` 的契约测试。
 * 文件格式问题作为结果返回；I/O 错误照常抛出。
 */
export interface Repository {
  /** Concept 的 frontmatter（Core 只需要 id、状态和前置依赖）。 */
  getConcept(conceptId: string): Promise<RepositoryRead<ConceptFrontmatter>>;
  getCriteria(conceptId: string): Promise<RepositoryRead<Criteria>>;
  getSession(
    conceptId: string,
    sessionId: string,
  ): Promise<RepositoryRead<AssessmentSession>>;
  listEvidence(conceptId: string): Promise<EvidenceList>;
  /** 追加一条证据（只能追加，不变量 2）。 */
  appendEvidence(evidence: Evidence): Promise<AppendEvidenceResult>;
  getMastery(conceptId: string): Promise<RepositoryRead<MasteryProjection>>;
  /** 写掌握度投影（派生数据，直接覆盖；内容没变时不写）。 */
  writeMastery(projection: MasteryProjection): Promise<WriteMasteryResult>;
  getHistory(
    conceptId: string,
  ): Promise<RepositoryRead<readonly MasteryHistoryEntry[]>>;
  appendHistory(
    conceptId: string,
    entry: MasteryHistoryEntry,
  ): Promise<AppendHistoryResult>;
}
