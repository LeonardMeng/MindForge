import { isPlatformError, type FileSystem } from '@mastery/platform';
import { NodeFileSystem } from '@mastery/platform-node';
import { createStore, type ReadResult, type StoreIssue } from '@mastery/store';

import { EXIT, type CliContext, type ExitCode } from '../context.js';
import { isDirectory, resolveUserPath } from '../paths.js';
import { checkReferences, type WorkspaceContents } from '../references.js';

/** `validate` 报告的一条问题。 */
export interface ValidationEntry {
  readonly file: string;
  readonly code: string;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

/** `validate` 的结果。 */
export interface ValidationReport {
  readonly errors: ValidationEntry[];
  readonly warnings: ValidationEntry[];
}

const entry = (issue: StoreIssue): ValidationEntry => ({
  file: issue.file,
  code: issue.code,
  path: issue.path,
  message: issue.message,
});

/** 列出一个目录下的子目录（目录不存在时为空）。 */
async function subdirectories(fs: FileSystem, dir: string): Promise<string[]> {
  try {
    return (await fs.list(dir))
      .filter((e) => e.kind === 'directory' && !e.name.startsWith('.'))
      .map((e) => e.name);
  } catch (error) {
    if (isPlatformError(error, 'platform.not_found')) return [];
    throw error;
  }
}

/**
 * 校验一个 Workspace：用 store 读取全部文件，再检查文件之间的引用。不需要 Profile（不变量 14）。
 *
 * @param fs - 以 Workspace 根目录为根的文件系统
 */
export async function validateWorkspace(
  fs: FileSystem,
): Promise<ValidationReport> {
  const store = createStore(fs);
  const errors: ValidationEntry[] = [];
  const warnings: ValidationEntry[] = [];
  /** 记下一次读取的问题，返回成功读到的值。 */
  const take = <T>(result: ReadResult<T> | null): T | null => {
    if (result === null) return null;
    if (!result.ok) {
      errors.push(...result.issues.map(entry));
      return null;
    }
    warnings.push(...result.warnings.map(entry));
    return result.value;
  };
  const listed = (result: { ids: string[]; issues: StoreIssue[] }) => {
    errors.push(...result.issues.map(entry));
    return result.ids;
  };

  if (
    take(await store.workspace.read()) === null &&
    (await fs.stat('workspace.yaml')) === null
  ) {
    errors.push({
      file: 'workspace.yaml',
      code: 'validate.workspace_missing',
      path: [],
      message: 'workspace.yaml is missing; this is not a Mastery OS workspace',
    });
  }

  const concepts = new Map<string, readonly string[]>();
  for (const id of listed(await store.concepts.list())) {
    const concept = take(await store.concepts.read(id));
    if (concept !== null) concepts.set(id, concept.frontmatter.prerequisites);
  }
  const projects = new Map<string, readonly string[]>();
  for (const id of listed(await store.projects.list())) {
    const project = take(await store.projects.read(id));
    if (project !== null) projects.set(id, project.concepts);
  }
  const criteria: string[] = [];
  for (const id of listed(await store.criteria.list())) {
    if (take(await store.criteria.read(id)) !== null) criteria.push(id);
  }
  const sessions: [string, string][] = [];
  for (const concept of await subdirectories(fs, 'assessments')) {
    for (const id of listed(await store.sessions.list(concept))) {
      if (take(await store.sessions.read(concept, id)) !== null)
        sessions.push([concept, id]);
    }
  }
  const evidence: WorkspaceContents['evidence'][number][] = [];
  for (const concept of await subdirectories(fs, 'evidence')) {
    for (const id of listed(await store.evidence.list(concept))) {
      const value = take(await store.evidence.read(concept, id));
      if (value !== null)
        evidence.push({ concept, id, session: value.session_id });
    }
  }
  const mastery: { concept: string; file: string }[] = [];
  for (const id of listed(await store.mastery.list())) {
    if (take(await store.mastery.read(id)) !== null) {
      mastery.push({ concept: id, file: `mastery/${id}.yaml` });
    }
  }
  let historyFiles: string[] = [];
  try {
    historyFiles = (await fs.list('mastery/history'))
      .filter((e) => e.kind === 'file' && e.name.endsWith('.jsonl'))
      .map((e) => e.name.slice(0, -'.jsonl'.length));
  } catch (error) {
    if (!isPlatformError(error, 'platform.not_found')) throw error;
  }
  for (const id of historyFiles) {
    if (take(await store.history.read(id)) !== null) {
      mastery.push({ concept: id, file: `mastery/history/${id}.jsonl` });
    }
  }
  const blindspots: WorkspaceContents['blindspots'][number][] = [];
  for (const id of listed(await store.blindspots.list())) {
    const value = take(await store.blindspots.read(id));
    if (value !== null) {
      blindspots.push({
        id,
        concept: value.concept_id,
        prerequisite: value.prerequisite_id,
        mergedInto: value.merged_into,
      });
    }
  }
  const interventions: { id: string; blindspot: string }[] = [];
  for (const id of listed(await store.interventions.list())) {
    const value = take(await store.interventions.read(id));
    if (value !== null)
      interventions.push({ id, blindspot: value.blindspot_id });
  }

  errors.push(
    ...checkReferences({
      concepts,
      projects,
      criteria,
      sessions,
      evidence,
      mastery,
      blindspots,
      interventions,
    }),
  );
  return { errors, warnings };
}

function format(kind: 'error' | 'warning', item: ValidationEntry): string {
  const where =
    item.path.length === 0 ? '' : ` (${item.path.map(String).join('.')})`;
  return `${kind}  ${item.file}${where}: ${item.message}\n`;
}

/**
 * `mastery validate <dir> [--json]`。
 *
 * @param context - 运行环境
 * @param dir - Workspace 目录
 * @param json - 输出 JSON
 */
export async function validateCommand(
  context: CliContext,
  dir: string,
  json: boolean,
): Promise<ExitCode> {
  const root = resolveUserPath(dir, context);
  if (!isDirectory(root)) {
    context.stderr.write(`mastery: ${dir} is not a directory\n`);
    return EXIT.failed;
  }
  const report = await validateWorkspace(await NodeFileSystem.open(root));
  if (json) {
    context.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    for (const item of report.errors)
      context.stdout.write(format('error', item));
    for (const item of report.warnings)
      context.stdout.write(format('warning', item));
    const plural = (n: number, word: string) =>
      `${String(n)} ${word}${n === 1 ? '' : 's'}`;
    context.stdout.write(
      `${plural(report.errors.length, 'error')}, ${plural(report.warnings.length, 'warning')}\n`,
    );
  }
  return report.errors.length === 0 ? EXIT.ok : EXIT.failed;
}
