import { parseArgs } from 'node:util';

import { initCommand } from './commands/init.js';
import { CommandError, profileInit, profileShow } from './commands/profile.js';
import { validateCommand } from './commands/validate.js';
import { dueCommand } from './commands/due.js';
import { evidenceAdd } from './commands/evidence.js';
import { recomputeCommand } from './commands/recompute.js';
import { statusCommand } from './commands/status.js';
import { DIMENSIONS } from '@mastery/schema';
import { EXIT, type CliContext, type ExitCode } from './context.js';

export const HELP = `Usage: mastery <command> [options]

Commands:
  profile init [dir]   Create a profile (default ~/MasteryProfile) and this device's device.yaml
      --name <name>            Display name (default: your user name)
      --language <tag>         Language, for example en or zh-CN (default: your system locale)
      --weekly-minutes <n>     Weekly time budget in minutes
  profile show         Show the profile and the state of each workspace on this device
      --json                   Machine-readable output
  init <dir>           Create a workspace, register it in the profile and add it to device.yaml
      --id <id>                Workspace id (default: the folder name)
      --name <name>            Display name (default: the id)
      --remote <url>           Git remote, for example git@github.com:me/ai.git
  validate <dir>       Check every file of a workspace and the references between them
      --json                   Machine-readable output
  evidence add [file]  Add a piece of evidence, then recompute its concept
                       file: a JSON evidence object (- for standard input); id and created_at may be left out
      --concept <slug>         Without a file: the concept
      --type <type>            independent_verification, practice or self_assessment
      --recall, --understanding, --reasoning, --application, --transfer <0..1>
                               Scores; leave a dimension out if it was not tested
      --confidence <0..1>      How sure the evaluator is
      --note <text>            Where the evidence comes from (required without --session)
      --session <ulid>         The assessment session it came from
      --criteria-version <n>   Default: the concept's current criteria version
      --json                   Machine-readable output
  recompute [concept]  Recompute mastery for one concept, or every concept with criteria
      --json                   Machine-readable output
  status [concept]     Show mastery (— means not tested, not 0); with a concept, also why and prerequisite risks
      --json                   Machine-readable output
  due                  List concepts that need review
      --within <days>          Also list reviews coming up within this many days
      --json                   Machine-readable output

  evidence, recompute, status and due take --workspace <dir>; by default they use the
  nearest folder with a workspace.yaml, from the current folder upwards.

Environment:
  MASTERY_HOME         Device folder (default ~/.mastery)

Exit codes:
  0  success (warnings allowed)
  1  errors found, the evidence was refused (nothing written), or the command failed
  2  wrong usage
  3  the evidence was saved, but recomputing its concept failed: do not add it again;
     fix the problem and run \`mastery recompute\`
`;

/** 用法错误：说明哪里不对，并提示 `--help`。 */
class UsageError extends Error {}

function parse(
  args: readonly string[],
  options: Record<string, { type: 'string' | 'boolean' }>,
  positionals: { readonly min: number; readonly max: number },
) {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      options,
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    throw new UsageError(
      error instanceof Error ? error.message : String(error),
    );
  }
  if (parsed.positionals.length < positionals.min)
    throw new UsageError('missing argument');
  if (parsed.positionals.length > positionals.max) {
    throw new UsageError(
      `unexpected argument "${parsed.positionals[positionals.max] ?? ''}"`,
    );
  }
  const value = (name: string): string | undefined => {
    const v = (parsed.values as Record<string, string | boolean | undefined>)[
      name
    ];
    return typeof v === 'string' ? v : undefined;
  };
  const flag = (name: string): boolean =>
    (parsed.values as Record<string, string | boolean | undefined>)[name] ===
    true;
  return { positionals: parsed.positionals, value, flag };
}

/**
 * 运行一条 `mastery` 命令。所有输出都写到 `context.stdout` / `context.stderr`，返回退出码，不调用
 * `process.exit`，所以测试可以在同一个进程里运行。
 *
 * @param argv - 命令行参数（不含 `node` 和脚本名）
 * @param context - 运行环境
 */
export async function run(
  argv: readonly string[],
  context: CliContext,
): Promise<ExitCode> {
  const [command, ...rest] = argv;
  try {
    if (
      command === undefined ||
      command === '--help' ||
      command === '-h' ||
      command === 'help'
    ) {
      context.stdout.write(HELP);
      return command === undefined ? EXIT.usage : EXIT.ok;
    }
    if (command === 'profile') {
      const [sub, ...args] = rest;
      if (sub === 'init') {
        const p = parse(
          args,
          {
            name: { type: 'string' },
            language: { type: 'string' },
            'weekly-minutes': { type: 'string' },
          },
          { min: 0, max: 1 },
        );
        return await profileInit(context, {
          dir: p.positionals[0],
          name: p.value('name'),
          language: p.value('language'),
          weeklyMinutes: p.value('weekly-minutes'),
        });
      }
      if (sub === 'show') {
        const p = parse(
          args,
          { json: { type: 'boolean' } },
          { min: 0, max: 0 },
        );
        return await profileShow(context, p.flag('json'));
      }
      throw new UsageError(`unknown command "profile ${sub ?? ''}"`.trimEnd());
    }
    if (command === 'init') {
      const p = parse(
        rest,
        {
          id: { type: 'string' },
          name: { type: 'string' },
          remote: { type: 'string' },
        },
        { min: 1, max: 1 },
      );
      return await initCommand(context, {
        dir: p.positionals[0] ?? '',
        id: p.value('id'),
        name: p.value('name'),
        remote: p.value('remote'),
      });
    }
    if (command === 'validate') {
      const p = parse(rest, { json: { type: 'boolean' } }, { min: 1, max: 1 });
      return await validateCommand(
        context,
        p.positionals[0] ?? '',
        p.flag('json'),
      );
    }
    if (command === 'evidence') {
      const [sub, ...args] = rest;
      if (sub !== 'add') {
        throw new UsageError(
          `unknown command "evidence ${sub ?? ''}"`.trimEnd(),
        );
      }
      const scoreOptions = Object.fromEntries(
        DIMENSIONS.map((d) => [d, { type: 'string' as const }]),
      );
      const p = parse(
        args,
        {
          workspace: { type: 'string' },
          concept: { type: 'string' },
          type: { type: 'string' },
          ...scoreOptions,
          confidence: { type: 'string' },
          note: { type: 'string' },
          session: { type: 'string' },
          'criteria-version': { type: 'string' },
          json: { type: 'boolean' },
        },
        { min: 0, max: 1 },
      );
      const file = p.positionals[0];
      const flagNames = [
        'concept',
        'type',
        ...DIMENSIONS,
        'confidence',
        'note',
        'session',
        'criteria-version',
      ];
      const used = flagNames.filter((name) => p.value(name) !== undefined);
      if (file !== undefined && used.length > 0) {
        throw new UsageError(
          `give either a JSON file or --${used[0] ?? ''} and the other options, not both`,
        );
      }
      return await evidenceAdd(context, {
        workspace: p.value('workspace'),
        file,
        json: p.flag('json'),
        flags: {
          concept: p.value('concept'),
          type: p.value('type'),
          scores: Object.fromEntries(
            DIMENSIONS.flatMap((d) => {
              const v = p.value(d);
              return v === undefined ? [] : [[d, v]];
            }),
          ),
          confidence: p.value('confidence'),
          note: p.value('note'),
          session: p.value('session'),
          criteriaVersion: p.value('criteria-version'),
        },
      });
    }
    if (command === 'recompute' || command === 'status') {
      const p = parse(
        rest,
        { workspace: { type: 'string' }, json: { type: 'boolean' } },
        { min: 0, max: 1 },
      );
      const options = {
        workspace: p.value('workspace'),
        concept: p.positionals[0],
        json: p.flag('json'),
      };
      return command === 'recompute'
        ? await recomputeCommand(context, options)
        : await statusCommand(context, options);
    }
    if (command === 'due') {
      const p = parse(
        rest,
        {
          workspace: { type: 'string' },
          within: { type: 'string' },
          json: { type: 'boolean' },
        },
        { min: 0, max: 0 },
      );
      return await dueCommand(context, {
        workspace: p.value('workspace'),
        within: p.value('within'),
        json: p.flag('json'),
      });
    }
    throw new UsageError(`unknown command "${command}"`);
  } catch (error) {
    if (error instanceof UsageError) {
      context.stderr.write(
        `mastery: ${error.message}\nRun \`mastery --help\` for usage.\n`,
      );
      return EXIT.usage;
    }
    if (error instanceof CommandError) {
      context.stderr.write(`mastery: ${error.message}\n`);
      return error.exitCode;
    }
    throw error;
  }
}
