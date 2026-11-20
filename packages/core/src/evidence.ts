import {
  DIMENSIONS,
  validateFile,
  type AssessmentSession,
  type Criteria,
  type Evidence,
} from '@mastery/schema';

import {
  coreError,
  type ConceptArchived,
  type ConceptNotFound,
  type ConceptUnreadable,
  type CriteriaNotFound,
  type CriteriaUnreadable,
  type CriteriaVersionMismatch,
  type DimensionNotAssessed,
  type EvidenceAlreadyExists,
  type EvidenceBeforeSession,
  type EvidenceInFuture,
  type EvidenceInvalid,
  type RepositoryIssue,
  type SessionAlreadyUsed,
  type SessionMismatch,
  type SessionNotFound,
  type SessionUnreadable,
} from './errors.js';
import { publish } from './events.js';
import type { Ports } from './ports.js';
import { err, ok, type Result } from './result.js';

/**
 * 证据的 `created_at` 最多可以比 `clock.now()` 晚多少（毫秒）。
 *
 * 留 5 分钟的余量：同一台机器的时钟会被小幅校正，`mastery evidence add`（2.8）读的 JSON 也可能是
 * 别的机器生成的。超过这个余量才拒绝（`core.evidence_in_future`）。
 */
export const EVIDENCE_CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

/** 还没写入的证据在错误里的文件位置。 */
export const EVIDENCE_INPUT_FILE = '<input>';

/** {@link submitEvidence} 可能返回的错误。 */
export type SubmitEvidenceError =
  | EvidenceInvalid
  | EvidenceInFuture
  | ConceptNotFound
  | ConceptUnreadable
  | ConceptArchived
  | CriteriaNotFound
  | CriteriaUnreadable
  | CriteriaVersionMismatch
  | DimensionNotAssessed
  | SessionNotFound
  | SessionUnreadable
  | SessionMismatch
  | EvidenceBeforeSession
  | SessionAlreadyUsed
  | EvidenceAlreadyExists;

const scored = (evidence: Evidence) =>
  DIMENSIONS.filter((dimension) => evidence.dimensions[dimension] !== null);

function checkCriteria(
  evidence: Evidence,
  criteria: Criteria,
): CriteriaVersionMismatch | DimensionNotAssessed | null {
  if (evidence.criteria_version !== criteria.version) {
    return coreError('core.criteria_version_mismatch', {
      concept_id: evidence.concept_id,
      expected: criteria.version,
      actual: evidence.criteria_version,
    });
  }
  const dimension = scored(evidence).find(
    (d) => criteria.dimensions[d] === null,
  );
  return dimension === undefined
    ? null
    : coreError('core.dimension_not_assessed', {
        concept_id: evidence.concept_id,
        dimension,
      });
}

function checkSession(
  evidence: Evidence,
  session: AssessmentSession,
): SessionMismatch | EvidenceBeforeSession | null {
  const mismatch = (field: string, expected: string, actual: string) =>
    coreError('core.session_mismatch', {
      session_id: session.id,
      field,
      expected,
      actual,
    });
  if (session.concept_id !== evidence.concept_id) {
    return mismatch('concept_id', session.concept_id, evidence.concept_id);
  }
  if (session.criteria_version !== evidence.criteria_version) {
    return mismatch(
      'criteria_version',
      String(session.criteria_version),
      String(evidence.criteria_version),
    );
  }
  const inSession = DIMENSIONS.filter((d) =>
    session.items.some((item) => item.scores[d] !== null),
  );
  const extra = scored(evidence).filter((d) => !inSession.includes(d));
  if (extra.length > 0) {
    return mismatch(
      'dimensions',
      inSession.join(','),
      scored(evidence).join(','),
    );
  }
  // IsoDateTime 只有一种写法（ADR-0013），可以直接按字符串比较先后。
  if (evidence.created_at < session.completed_at) {
    return coreError('core.evidence_before_session', {
      session_id: session.id,
      created_at: evidence.created_at,
      completed_at: session.completed_at,
    });
  }
  return null;
}

/**
 * 提交一条证据（不变量 2：只追加）。**这里不算掌握度**：投影由 2.5 根据全部证据重算。
 *
 * 检查顺序（第一个不通过的检查决定错误，什么都不写）：
 * 1. 符合 schema → `core.evidence_invalid`；
 * 2. `created_at` 不比现在晚超过 {@link EVIDENCE_CLOCK_TOLERANCE_MS} → `core.evidence_in_future`；
 * 3. Concept 存在、读得了、不是 `archived`（`draft` 和 `active` 都接受）；
 * 4. 评测标准存在、读得了、版本相同，证据打分的维度都是标准考察的维度；
 * 5. 有 `session_id` 时：会话存在、读得了，Concept、标准版本一致，证据打分的维度都在会话里有分数，
 *    证据不早于会话完成的时间；
 * 6. 一个会话只产生一条证据 → `core.session_already_used`（现在扫一遍 `listEvidence`，3.x 改由索引回答）；
 * 7. 写入：同一个 id 已经存在 → `core.evidence_already_exists`。
 *
 * 写入成功后发出 `evidence/submitted`。I/O 错误照常抛出。
 *
 * @param ports - Core 的端口
 * @param input - 证据数据（未校验）
 * @returns 写入的证据，或者领域错误
 */
export async function submitEvidence(
  ports: Ports,
  input: unknown,
): Promise<Result<Evidence, SubmitEvidenceError>> {
  const { repository, clock } = ports;

  const validated = validateFile('evidence', input);
  if (!validated.success) {
    const issues: RepositoryIssue[] = validated.issues.map((issue) => ({
      file: EVIDENCE_INPUT_FILE,
      code: issue.code,
      path: issue.path,
      message: issue.message,
    }));
    return err(coreError('core.evidence_invalid', {}, issues));
  }
  const evidence = validated.data;
  const conceptId = evidence.concept_id;

  const now = clock.now();
  if (
    Date.parse(evidence.created_at) - Date.parse(now) >
    EVIDENCE_CLOCK_TOLERANCE_MS
  ) {
    return err(
      coreError('core.evidence_in_future', {
        created_at: evidence.created_at,
        now,
        tolerance_minutes: EVIDENCE_CLOCK_TOLERANCE_MS / 60_000,
      }),
    );
  }

  const concept = await repository.getConcept(conceptId);
  if (concept.kind === 'missing') {
    return err(coreError('core.concept_not_found', { concept_id: conceptId }));
  }
  if (concept.kind === 'unreadable') {
    return err(
      coreError(
        'core.concept_unreadable',
        { concept_id: conceptId },
        concept.issues,
      ),
    );
  }
  if (concept.value.status === 'archived') {
    return err(coreError('core.concept_archived', { concept_id: conceptId }));
  }

  const criteria = await repository.getCriteria(conceptId);
  if (criteria.kind === 'missing') {
    return err(coreError('core.criteria_not_found', { concept_id: conceptId }));
  }
  if (criteria.kind === 'unreadable') {
    return err(
      coreError(
        'core.criteria_unreadable',
        { concept_id: conceptId },
        criteria.issues,
      ),
    );
  }
  const criteriaError = checkCriteria(evidence, criteria.value);
  if (criteriaError !== null) return err(criteriaError);

  const sessionId = evidence.session_id;
  if (sessionId !== null) {
    const session = await repository.getSession(conceptId, sessionId);
    if (session.kind === 'missing') {
      return err(
        coreError('core.session_not_found', { session_id: sessionId }),
      );
    }
    if (session.kind === 'unreadable') {
      return err(
        coreError(
          'core.session_unreadable',
          { session_id: sessionId },
          session.issues,
        ),
      );
    }
    const sessionError = checkSession(evidence, session.value);
    if (sessionError !== null) return err(sessionError);

    // 版本过新或读不了的证据看不到 session_id，这里只能检查读得了的（3.x 由索引回答）。
    const existing = await repository.listEvidence(conceptId);
    const used = existing.items.find((item) => item.session_id === sessionId);
    if (used !== undefined) {
      return err(
        coreError('core.session_already_used', {
          session_id: sessionId,
          evidence_id: used.id,
        }),
      );
    }
  }

  const appended = await repository.appendEvidence(evidence);
  if (!appended.ok) {
    return err(
      appended.reason === 'exists'
        ? coreError('core.evidence_already_exists', {
            evidence_id: evidence.id,
          })
        : coreError('core.evidence_invalid', {}, appended.issues),
    );
  }

  publish(ports.events, {
    type: 'evidence/submitted',
    conceptId,
    evidenceId: evidence.id,
    at: clock.now(),
  });
  return ok(evidence);
}
