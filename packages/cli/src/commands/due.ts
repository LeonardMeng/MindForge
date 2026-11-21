import { EXIT, type CliContext, type ExitCode } from '../context.js';
import { openWorkspace, table } from '../workspace.js';
import { statusOf } from './status.js';
import { CommandError } from './profile.js';

const DAY_MS = 86_400_000;

/** `due` 的一项。 */
interface DueItem {
  readonly concept: string;
  /** `due`：mastered 到期；`regressed`：证据显示退步（保存的 needs_review）；`upcoming`：`--within` 天内到期。 */
  readonly reason: 'due' | 'regressed' | 'upcoming';
  readonly review_due_at: string | null;
}

/**
 * `mastery due [--within <days>] [--json]`（2.8）：需要复习的 Concept。到期的 `mastered` 和
 * 保存的 `needs_review`（证据显示退步）；`--within` 还列出这么多天之内到期的。按到期时间排序，
 * 退步的（没有到期时间）在前面。
 */
export async function dueCommand(
  context: CliContext,
  options: {
    readonly workspace?: string;
    readonly within?: string;
    readonly json: boolean;
  },
): Promise<ExitCode> {
  let withinDays = 0;
  if (options.within !== undefined) {
    withinDays = Number(options.within);
    if (!Number.isInteger(withinDays) || withinDays < 0) {
      throw new CommandError(
        `--within must be a whole number of days (got "${options.within}")`,
        EXIT.usage,
      );
    }
  }
  const workspace = await openWorkspace(context, options.workspace);
  const now = Date.parse(workspace.clock.now());
  const listed = await workspace.store.concepts.list();
  const items: DueItem[] = [];
  for (const concept of listed.ids) {
    const { status } = await statusOf(workspace, concept);
    if (status.state === 'needs_review') {
      items.push({ concept, reason: 'regressed', review_due_at: null });
    } else if (status.due) {
      items.push({
        concept,
        reason: 'due',
        review_due_at: status.review_due_at,
      });
    } else if (
      status.review_due_at !== null &&
      withinDays > 0 &&
      Date.parse(status.review_due_at) <= now + withinDays * DAY_MS
    ) {
      items.push({
        concept,
        reason: 'upcoming',
        review_due_at: status.review_due_at,
      });
    }
  }
  items.sort((a, b) => {
    const ka = a.review_due_at ?? '';
    const kb = b.review_due_at ?? '';
    return ka < kb ? -1 : ka > kb ? 1 : a.concept < b.concept ? -1 : 1;
  });

  if (options.json) {
    context.stdout.write(`${JSON.stringify({ concepts: items }, null, 2)}\n`);
    return EXIT.ok;
  }
  if (items.length === 0) {
    context.stdout.write(
      withinDays > 0
        ? `nothing to review in the next ${withinDays} day(s)\n`
        : 'nothing to review\n',
    );
    return EXIT.ok;
  }
  const label = {
    due: 'review due',
    regressed: 'needs review (latest evidence fell short)',
    upcoming: 'coming up',
  };
  context.stdout.write(
    table(
      items.map((item) => [
        item.review_due_at === null ? '—' : item.review_due_at.slice(0, 10),
        item.concept,
        label[item.reason],
      ]),
    ),
  );
  return EXIT.ok;
}
