import { formatExplanation } from '@mastery/rules-v1';
import {
  prerequisiteRisks,
  reviewStatus,
  type PrerequisiteRisk,
} from '@mastery/core';
import { DIMENSIONS, type MasteryProjection } from '@mastery/schema';

import { EXIT, type CliContext, type ExitCode } from '../context.js';
import {
  formatCoreError,
  formatScore,
  openWorkspace,
  table,
  type OpenWorkspace,
} from '../workspace.js';

/** 一个 Concept 的状态（`status --json` 的一项）。 */
export interface ConceptStatus {
  readonly concept: string;
  /** 保存的状态；没有投影时是 `not_assessed`，投影读不了时是 `unreadable`。 */
  readonly state: string;
  /** 读取时的状态：到期的 `mastered` 是 `needs_review`。 */
  readonly effective_state: string;
  readonly due: boolean;
  readonly review_due_at: string | null;
  readonly dimensions: MasteryProjection['dimensions'] | null;
  readonly confidence: number | null;
  /**
   * 投影需要重算：磁盘上的证据和投影的 `evidence_ids` 不一样，或者投影是别的规则版本算的。
   */
  readonly stale: boolean;
}

/** 读一个 Concept 的投影和证据，得出它的状态。 */
async function statusOf(
  workspace: OpenWorkspace,
  concept: string,
): Promise<{ status: ConceptStatus; projection: MasteryProjection | null }> {
  const { repository, clock, rules } = workspace.ports;
  const read = await repository.getMastery(concept);
  const evidence = await repository.listEvidence(concept);
  const onDisk = [
    ...evidence.items.map((e) => e.id as string),
    ...[...evidence.tooNew, ...evidence.unreadable].map((e) => e.id ?? e.file),
  ].sort();
  if (read.kind !== 'found') {
    const unreadable = read.kind === 'unreadable';
    return {
      projection: null,
      status: {
        concept,
        state: unreadable ? 'unreadable' : 'not_assessed',
        effective_state: unreadable ? 'unreadable' : 'not_assessed',
        due: false,
        review_due_at: null,
        dimensions: null,
        confidence: null,
        stale: unreadable || onDisk.length > 0,
      },
    };
  }
  const projection = read.value;
  const review = reviewStatus(projection, clock.now());
  const stale =
    projection.rules_version !== rules.current().version ||
    JSON.stringify(onDisk) !==
      JSON.stringify([...projection.evidence_ids].sort());
  return {
    projection,
    status: {
      concept,
      state: projection.state,
      effective_state: review.effectiveState,
      due: review.due,
      review_due_at: projection.review_due_at,
      dimensions: projection.dimensions,
      confidence: projection.confidence,
      stale,
    },
  };
}

const stateText = (s: ConceptStatus) =>
  s.due ? 'needs_review (due)' : s.effective_state;
const dateText = (value: string | null) =>
  value === null ? '' : value.slice(0, 10);

function riskText(risk: PrerequisiteRisk): string {
  const via = risk.via.length === 0 ? '' : ` (via ${risk.via.join(' > ')})`;
  const reason =
    risk.reason.kind === 'state'
      ? risk.reason.state
      : risk.reason.kind === 'review_due'
        ? `review due since ${dateText(risk.reason.dueAt)}`
        : risk.reason.kind === 'mastery_unreadable'
          ? `projection cannot be read${risk.reason.tooNew ? ' (written by a newer version)' : ''}`
          : risk.reason.kind === 'concept_missing'
            ? 'concept does not exist'
            : 'concept file cannot be read';
  return `${risk.conceptId}${via}: ${reason}`;
}

/**
 * `mastery status [concept] [--json]`（2.8）：只读投影，不重算。没给 Concept 时每个 Concept 一行；
 * 给了时显示维度和阈值、explanation 和前置依赖风险。`—` 表示没测过（不是 0）。
 */
export async function statusCommand(
  context: CliContext,
  options: {
    readonly workspace?: string;
    readonly concept?: string;
    readonly json: boolean;
  },
): Promise<ExitCode> {
  const workspace = await openWorkspace(context, options.workspace);

  if (options.concept === undefined) {
    const listed = await workspace.store.concepts.list();
    for (const issue of listed.issues) {
      context.stderr.write(`warning  ${issue.file}: ${issue.message}\n`);
    }
    const statuses: ConceptStatus[] = [];
    for (const id of listed.ids)
      statuses.push((await statusOf(workspace, id)).status);
    if (options.json) {
      context.stdout.write(
        `${JSON.stringify({ concepts: statuses }, null, 2)}\n`,
      );
      return EXIT.ok;
    }
    context.stdout.write(
      table([
        ['concept', 'state', ...DIMENSIONS, 'confidence', 'review', ''],
        ...statuses.map((s) => [
          s.concept,
          stateText(s),
          ...DIMENSIONS.map((d) => formatScore(s.dimensions?.[d] ?? null)),
          s.confidence === null ? '—' : s.confidence.toFixed(2),
          dateText(s.review_due_at),
          s.stale ? 'stale' : '',
        ]),
      ]),
    );
    if (statuses.some((s) => s.stale)) {
      context.stdout.write(
        '\nstale: the projection is out of date; run `mastery recompute`.\n',
      );
    }
    return EXIT.ok;
  }

  const concept = options.concept;
  const exists = await workspace.ports.repository.getConcept(concept);
  if (exists.kind !== 'found') {
    context.stderr.write(
      `mastery: ${exists.kind === 'missing' ? `concept "${concept}" does not exist` : `concept "${concept}" cannot be read`}\n`,
    );
    return EXIT.failed;
  }
  const { status, projection } = await statusOf(workspace, concept);
  const criteria = await workspace.ports.repository.getCriteria(concept);
  const risks = await prerequisiteRisks(workspace.ports, concept);
  const explanation = (projection?.explanation ?? []).map((item) => ({
    ...item,
    text: formatExplanation(item),
  }));

  if (options.json) {
    context.stdout.write(
      `${JSON.stringify({ ...status, explanation, prerequisite_risks: risks.ok ? risks.value : [] }, null, 2)}\n`,
    );
    return EXIT.ok;
  }

  const out: string[] = [];
  out.push(
    `${concept}: ${stateText(status)}${status.stale ? ' (stale: run `mastery recompute`)' : ''}`,
  );
  if (status.confidence !== null)
    out.push(`confidence ${status.confidence.toFixed(2)}`);
  if (status.review_due_at !== null) {
    out.push(
      `review ${status.due ? 'was due' : 'due'} on ${dateText(status.review_due_at)}`,
    );
  }
  out.push('');
  out.push(
    table([
      ['dimension', 'score', 'threshold'],
      ...DIMENSIONS.map((d) => {
        const criterion =
          criteria.kind === 'found' ? criteria.value.dimensions[d] : null;
        return [
          d,
          formatScore(status.dimensions?.[d] ?? null),
          criterion === null ? 'not assessed' : criterion.threshold.toFixed(2),
        ];
      }),
    ]).trimEnd(),
  );
  if (explanation.length > 0) {
    out.push('', 'why:');
    for (const item of explanation) out.push(`  - ${item.text}`);
  }
  if (risks.ok && risks.value.length > 0) {
    out.push('', 'prerequisite risks:');
    for (const risk of risks.value) out.push(`  - ${riskText(risk)}`);
  }
  context.stdout.write(`${out.join('\n')}\n`);
  if (!risks.ok) context.stderr.write(formatCoreError(risks.error));
  return EXIT.ok;
}

export { statusOf };
