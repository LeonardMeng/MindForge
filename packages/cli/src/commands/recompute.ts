import { recalculate, type CoreError } from '@mastery/core';

import { EXIT, type CliContext, type ExitCode } from '../context.js';
import { formatCoreError, openWorkspace, table } from '../workspace.js';

/** 一个 Concept 的重算结果。 */
interface Line {
  readonly concept: string;
  readonly outcome:
    'changed' | 'unchanged' | 'rewritten' | 'skipped' | 'failed';
  readonly state: string | null;
  readonly error?: CoreError;
}

/**
 * `mastery recompute [concept]`（2.8）：重算一个或所有 Concept 的掌握度。不给 Concept 时，没有评测
 * 标准的 Concept 跳过（它们不能有证据）。某个 Concept 失败时接着算其他的，最后退出码 1。
 */
export async function recomputeCommand(
  context: CliContext,
  options: {
    readonly workspace?: string;
    readonly concept?: string;
    readonly json: boolean;
  },
): Promise<ExitCode> {
  const { store, ports } = await openWorkspace(context, options.workspace);
  let ids: string[];
  if (options.concept !== undefined) {
    ids = [options.concept];
  } else {
    const listed = await store.concepts.list();
    for (const issue of listed.issues) {
      context.stderr.write(`warning  ${issue.file}: ${issue.message}\n`);
    }
    ids = listed.ids;
  }

  const lines: Line[] = [];
  for (const concept of ids) {
    if (
      options.concept === undefined &&
      (await ports.repository.getCriteria(concept)).kind === 'missing'
    ) {
      lines.push({ concept, outcome: 'skipped', state: null });
      continue;
    }
    const result = await recalculate(ports, concept);
    if (!result.ok) {
      lines.push({
        concept,
        outcome: 'failed',
        state: null,
        error: result.error,
      });
      continue;
    }
    const { projection, changed, projectionWritten, historyWritten } =
      result.value;
    lines.push({
      concept,
      outcome: changed
        ? 'changed'
        : projectionWritten || historyWritten
          ? 'rewritten'
          : 'unchanged',
      state: projection?.state ?? null,
    });
  }

  const failed = lines.some((line) => line.outcome === 'failed');
  if (options.json) {
    context.stdout.write(`${JSON.stringify({ concepts: lines }, null, 2)}\n`);
  } else {
    context.stdout.write(
      table(
        lines.map((line) => [
          line.concept,
          line.outcome === 'skipped' ? 'skipped (no criteria)' : line.outcome,
          line.state ?? (line.outcome === 'unchanged' ? 'no evidence' : ''),
        ]),
      ),
    );
    for (const line of lines) {
      if (line.error !== undefined) {
        context.stderr.write(
          `mastery: recomputing ${line.concept} failed\n${formatCoreError(line.error)}`,
        );
      }
    }
  }
  return failed ? EXIT.failed : EXIT.ok;
}
