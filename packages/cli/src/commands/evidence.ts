import { readFile } from 'node:fs/promises';

import { recalculate, submitEvidence } from '@mastery/core';
import { DIMENSIONS, type Dimension } from '@mastery/schema';

import { EXIT, type CliContext, type ExitCode } from '../context.js';
import { resolveUserPath } from '../paths.js';
import { formatCoreError, openWorkspace } from '../workspace.js';
import { CommandError } from './profile.js';

/** `evidence add` 从命令行参数录入时的值。 */
export interface EvidenceFlags {
  readonly concept?: string;
  readonly type?: string;
  readonly scores: Readonly<Partial<Record<Dimension, string>>>;
  readonly confidence?: string;
  readonly note?: string;
  readonly session?: string;
  readonly criteriaVersion?: string;
}

/** `mastery evidence add` 的选项。 */
export interface EvidenceAddOptions {
  readonly workspace?: string;
  /** JSON 文件；`-` 是标准输入。没有时用 {@link EvidenceFlags}。 */
  readonly file?: string;
  readonly flags: EvidenceFlags;
  readonly json: boolean;
}

const usage = (message: string) => new CommandError(message, EXIT.usage);

/** 解析一个 `0..1` 的数（格式不对是用法错误；范围由 schema 检查）。 */
function number(name: string, value: string): number {
  const parsed = Number(value);
  if (value.trim() === '' || !Number.isFinite(parsed)) {
    throw usage(`--${name} must be a number, for example 0.8 (got "${value}")`);
  }
  return parsed;
}

async function readInput(context: CliContext, file: string): Promise<unknown> {
  let text: string;
  if (file === '-') {
    if (context.readStdin === undefined)
      throw usage('reading evidence from standard input is not supported here');
    text = await context.readStdin();
  } else {
    try {
      text = await readFile(resolveUserPath(file, context), 'utf8');
    } catch (error) {
      throw new CommandError(
        `cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new CommandError(
      `${file === '-' ? 'standard input' : file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * `mastery evidence add`：提交一条证据，然后重算那个 Concept（2.8）。
 *
 * - 从 JSON 文件读取时，只有 `id`（生成新的 ULID）和 `created_at`（当前时间）可以不写。
 * - 从命令行参数录入时，`evaluator` 是 `{ kind: human }`，`criteria_version` 默认是当前的版本。
 * - 人手动录入、没有会话的独立验证照样接受，但提示它是自己报告的、照样计入掌握度。
 * - 证据被拒绝：退出码 1，什么都没写。证据已保存但重算失败：退出码 3，并打印证据的 id，
 *   **不要重试**（重试会记下重复的证据）。
 */
export async function evidenceAdd(
  context: CliContext,
  options: EvidenceAddOptions,
): Promise<ExitCode> {
  const workspace = await openWorkspace(context, options.workspace);
  const { ports, clock, ids } = workspace;

  let input: Record<string, unknown>;
  if (options.file !== undefined) {
    const parsed = await readInput(context, options.file);
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      throw new CommandError('the evidence must be a JSON object');
    }
    input = { ...(parsed as Record<string, unknown>) };
    if (!('id' in input)) input.id = ids.ulid();
    if (!('created_at' in input)) input.created_at = clock.now();
  } else {
    const { flags } = options;
    if (flags.concept === undefined)
      throw usage('--concept is required (or give a JSON file)');
    if (flags.type === undefined)
      throw usage(
        '--type is required: independent_verification, practice or self_assessment',
      );
    if (flags.confidence === undefined)
      throw usage('--confidence is required, for example 0.8');
    let criteriaVersion = 1;
    if (flags.criteriaVersion !== undefined) {
      criteriaVersion = number('criteria-version', flags.criteriaVersion);
    } else {
      const criteria = await ports.repository.getCriteria(flags.concept);
      if (criteria.kind === 'found') criteriaVersion = criteria.value.version;
    }
    const dimensions = {} as Record<Dimension, number | null>;
    for (const d of DIMENSIONS) {
      const value = flags.scores[d];
      dimensions[d] = value === undefined ? null : number(d, value);
    }
    input = {
      schema_version: 1,
      id: ids.ulid(),
      concept_id: flags.concept,
      session_id: flags.session ?? null,
      assessment_type: flags.type,
      criteria_version: criteriaVersion,
      dimensions,
      confidence: number('confidence', flags.confidence),
      evaluator: { kind: 'human' },
      note: flags.note ?? null,
      created_at: clock.now(),
    };
  }

  const evaluator = input.evaluator as { kind?: unknown } | undefined;
  const selfReported =
    input.assessment_type === 'independent_verification' &&
    evaluator?.kind === 'human' &&
    input.session_id === null;

  const submitted = await submitEvidence(ports, input);
  if (!submitted.ok) {
    if (options.json) {
      context.stdout.write(
        `${JSON.stringify({ saved: false, error: submitted.error }, null, 2)}\n`,
      );
    } else {
      context.stderr.write(
        `mastery: the evidence was refused; nothing was written\n${formatCoreError(submitted.error)}`,
      );
    }
    return EXIT.failed;
  }
  const evidence = submitted.value;
  if (selfReported && !options.json) {
    context.stderr.write(
      'notice: this independent verification was entered by hand without an assessment session; ' +
        'it is self-reported and counts toward mastery like any other\n',
    );
  }

  const recalculated = await recalculate(ports, evidence.concept_id);
  if (!recalculated.ok) {
    if (options.json) {
      context.stdout.write(
        `${JSON.stringify({ saved: true, evidence_id: evidence.id, self_reported: selfReported, recompute: { ok: false, error: recalculated.error } }, null, 2)}\n`,
      );
    } else {
      context.stdout.write(
        `saved evidence ${evidence.id} for ${evidence.concept_id}\n`,
      );
      context.stderr.write(
        `mastery: evidence ${evidence.id} was saved, but recomputing ${evidence.concept_id} failed. ` +
          'Do not add it again; fix the problem and run `mastery recompute`.\n' +
          formatCoreError(recalculated.error),
      );
    }
    return EXIT.savedNotRecomputed;
  }
  const state = recalculated.value.projection?.state ?? 'not_assessed';
  if (options.json) {
    context.stdout.write(
      `${JSON.stringify({ saved: true, evidence_id: evidence.id, self_reported: selfReported, recompute: { ok: true, state, changed: recalculated.value.changed } }, null, 2)}\n`,
    );
  } else {
    context.stdout.write(
      `saved evidence ${evidence.id} for ${evidence.concept_id}\n` +
        `${evidence.concept_id}: ${state}${recalculated.value.changed ? '' : ' (unchanged)'}\n`,
    );
  }
  return EXIT.ok;
}
