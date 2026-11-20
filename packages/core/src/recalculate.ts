import type {
  MasteryChangeCause,
  MasteryHistoryEntry,
  MasteryProjection,
} from '@mastery/schema';

import {
  coreError,
  type ConceptNotFound,
  type ConceptUnreadable,
  type CriteriaNotFound,
  type CriteriaUnreadable,
  type EvidenceUnreadable,
  type EvidenceVersionTooNew,
  type MasteryVersionTooNew,
  type RepositoryIssue,
  type RulesVersionUnknown,
} from './errors.js';
import { publish } from './events.js';
import type { Evaluation, Ports } from './ports.js';
import { err, ok, type Result } from './result.js';

/** {@link recalculate} 可能返回的错误。 */
export type RecalculateError =
  | ConceptNotFound
  | ConceptUnreadable
  | CriteriaNotFound
  | CriteriaUnreadable
  | EvidenceVersionTooNew
  | EvidenceUnreadable
  | MasteryVersionTooNew
  | RulesVersionUnknown;

/** {@link recalculate} 的结果。 */
export interface RecalculateResult {
  /** 算出的投影；没有证据也没有投影时为 null（什么都没写）。 */
  readonly projection: MasteryProjection | null;
  /** 投影文件写了没有（内容没变时不写）。 */
  readonly projectionWritten: boolean;
  /** 投影的值变了没有（变了才发出 `mastery/changed`）。 */
  readonly changed: boolean;
  /** 历史文件写了没有（内容没变时不写）。 */
  readonly historyWritten: boolean;
}

/** 键排序后的 JSON：按值比较，不受键的顺序影响。 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  );
}

/**
 * 从状态机的步骤推导掌握度历史：第一步一条，之后 `state`、`dimensions` 或 `confidence` 变了的每一步一条。
 * `at` 是那条证据的 `created_at`，`cause` 是那条证据。同样的证据、criteria 和规则得到同样的历史
 * （不变量 3），所以 merge driver 可以重算它（3.7）。
 *
 * @param evaluation - 规则的判定结果
 * @param rulesVersion - 规则版本
 */
export function deriveHistory(
  evaluation: Evaluation,
  rulesVersion: number,
): MasteryHistoryEntry[] {
  const entries: MasteryHistoryEntry[] = [];
  let previous: string | null = null;
  for (const step of evaluation.steps) {
    const key = canonical([step.to, step.dimensions, step.confidence]);
    if (key === previous) continue;
    previous = key;
    entries.push({
      schema_version: 1,
      at: step.at,
      state: step.to,
      dimensions: step.dimensions,
      confidence: step.confidence,
      rules_version: rulesVersion,
      cause: { kind: 'evidence', evidence_id: step.evidenceId },
    });
  }
  return entries;
}

const tooNewIssues = (
  conceptId: string,
  file: string,
  issues: readonly RepositoryIssue[],
): MasteryVersionTooNew =>
  coreError(
    'core.mastery_version_too_new',
    { concept_id: conceptId, file },
    issues,
  );

/**
 * 重算一个 Concept 的掌握度（ROADMAP 2.5）：读取全部证据，用 `rules.current()` 判定，
 * 写出投影 `mastery/<slug>.yaml` 和由证据推导的历史 `mastery/history/<slug>.jsonl`。
 *
 * - 有任何证据是更新版本写的（`core.evidence_version_too_new`）或读不了（`core.evidence_unreadable`）时
 *   拒绝，什么都不写：否则投影会悄悄漏掉证据，再通过 Git 同步出去。
 * - 已有的投影是更新的规则版本算的时拒绝（`core.rules_version_unknown`，不降级）；投影或历史文件是
 *   更新版本写的时拒绝（`core.mastery_version_too_new`）。读不了的投影和历史直接覆盖（派生数据）。
 * - 没有任何证据文件、也没有投影时什么都不写；没有证据文件但有投影时写成 `not_assessed`。
 * - 投影的值变了才写文件并发出 `mastery/changed`；值没变、只是格式不同时写回规范形式，不发事件。
 *   历史每次都和推导结果对齐，字节相同时不写。所以写到一半崩溃后，再算一次就能补齐。
 *
 * 不读时钟。I/O 错误照常抛出。
 *
 * @param ports - Core 的端口
 * @param conceptId - Concept 的 slug
 */
export async function recalculate(
  ports: Ports,
  conceptId: string,
): Promise<Result<RecalculateResult, RecalculateError>> {
  const { repository, rules: registry } = ports;
  const params = { concept_id: conceptId };

  const concept = await repository.getConcept(conceptId);
  if (concept.kind === 'missing')
    return err(coreError('core.concept_not_found', params));
  if (concept.kind === 'unreadable') {
    return err(coreError('core.concept_unreadable', params, concept.issues));
  }

  const criteria = await repository.getCriteria(conceptId);
  if (criteria.kind === 'missing')
    return err(coreError('core.criteria_not_found', params));
  if (criteria.kind === 'unreadable') {
    return err(coreError('core.criteria_unreadable', params, criteria.issues));
  }

  const evidence = await repository.listEvidence(conceptId);
  if (evidence.tooNew.length > 0) {
    return err(
      coreError(
        'core.evidence_version_too_new',
        { ...params, count: evidence.tooNew.length },
        evidence.tooNew.flatMap((e) => e.issues),
      ),
    );
  }
  if (evidence.unreadable.length > 0) {
    return err(
      coreError(
        'core.evidence_unreadable',
        { ...params, count: evidence.unreadable.length },
        evidence.unreadable.flatMap((e) => e.issues),
      ),
    );
  }

  const rules = registry.current();
  const existing = await repository.getMastery(conceptId);
  if (existing.kind === 'unreadable' && existing.tooNew) {
    return err(
      tooNewIssues(conceptId, `mastery/${conceptId}.yaml`, existing.issues),
    );
  }
  const previous = existing.kind === 'found' ? existing.value : null;
  if (previous !== null && previous.rules_version > rules.version) {
    return err(
      coreError('core.rules_version_unknown', {
        version: previous.rules_version,
      }),
    );
  }
  const history = await repository.getHistory(conceptId);
  if (history.kind === 'unreadable' && history.tooNew) {
    return err(
      tooNewIssues(
        conceptId,
        `mastery/history/${conceptId}.jsonl`,
        history.issues,
      ),
    );
  }

  if (evidence.items.length === 0 && existing.kind === 'missing') {
    return ok({
      projection: null,
      projectionWritten: false,
      changed: false,
      historyWritten: false,
    });
  }

  const evaluation = rules.evaluate(evidence.items, criteria.value);
  const projection = {
    schema_version: 1,
    concept_id: conceptId,
    state: evaluation.state,
    dimensions: evaluation.aggregate.dimensions,
    confidence: evaluation.aggregate.confidence,
    rules_version: rules.version,
    evidence_ids: evidence.items.map((e) => e.id).sort(),
    explanation: [...evaluation.explanation],
  } as MasteryProjection;

  const historyWrite = await repository.writeHistory(
    conceptId,
    deriveHistory(evaluation, rules.version),
  );
  if (!historyWrite.ok) {
    if (historyWrite.reason === 'too_new') {
      return err(
        tooNewIssues(
          conceptId,
          `mastery/history/${conceptId}.jsonl`,
          historyWrite.issues,
        ),
      );
    }
    throw new Error(
      `the rules produced an invalid history entry: ${historyWrite.issues[0]?.message ?? ''}`,
    );
  }

  const masteryWrite = await repository.writeMastery(projection);
  if (!masteryWrite.ok) {
    if (masteryWrite.reason === 'too_new') {
      return err(
        tooNewIssues(
          conceptId,
          `mastery/${conceptId}.yaml`,
          masteryWrite.issues,
        ),
      );
    }
    throw new Error(
      `the rules produced an invalid projection: ${masteryWrite.issues[0]?.message ?? ''}`,
    );
  }

  const changed =
    previous === null || canonical(previous) !== canonical(projection);
  if (changed) {
    const last = evaluation.steps[evaluation.steps.length - 1];
    const cause: MasteryChangeCause =
      (previous !== null && previous.rules_version !== rules.version) ||
      last === undefined
        ? { kind: 'rules' }
        : { kind: 'evidence', evidence_id: last.evidenceId };
    publish(ports.events, {
      type: 'mastery/changed',
      conceptId: concept.value.id,
      from: previous?.state ?? null,
      to: projection.state,
      rulesVersion: rules.version,
      cause,
    });
  }

  return ok({
    projection,
    projectionWritten: masteryWrite.written,
    changed,
    historyWritten: historyWrite.written,
  });
}
