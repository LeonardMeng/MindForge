import {
  isPlatformError,
  parentPath,
  type FileSystem,
} from '@mastery/platform';
import {
  conceptFrontmatterWarnings,
  parseConceptBody,
  Slug,
  Ulid,
  validateFile,
  type AssessmentSession,
  type Blindspot,
  type ConceptFrontmatter,
  type Criteria,
  type Evidence,
  type FileKind,
  type FileValidationResult,
  type Intervention,
  type MasteryHistoryEntry,
  type MasteryProjection,
  type ProjectConfig,
  type SchemaIssue,
  type WorkspaceConfig,
} from '@mastery/schema';

import {
  fromRawIssue,
  fromSchemaIssue,
  storeIssue,
  type StoreIssue,
} from './errors.js';
import {
  joinFrontmatter,
  splitFrontmatter,
  type FrontmatterParts,
} from './frontmatter.js';
import { sha256Hex } from './hash.js';
import {
  parseYaml,
  patchYaml,
  stringifyYaml,
  type YamlParsed,
} from './yaml.js';

/** 一个 Concept 文件：frontmatter 和原样保留的正文。 */
export interface Concept {
  readonly frontmatter: ConceptFrontmatter;
  /** 结束 frontmatter 的 `---` 那一行之后的全部内容，原样保留。 */
  readonly body: string;
}

/**
 * 读取时文件的样子：路径和内容的 SHA-256。保存时作为 `base` 传回来，
 * store 用它确认文件在读取之后没有被别人改过（{@link SaveOptions}）。
 * 只是数据，可以保存下来（4.2 的 Proposal 冲突检查也用它）。
 */
export interface Snapshot {
  /** 文件相对于 Workspace 根目录的路径。 */
  readonly path: string;
  /** 文件内容（UTF-8 字节）的 SHA-256，十六进制小写。 */
  readonly sha256: string;
}

/** 读取的结果。文件不存在时 `read` 返回 `null`。 */
export type ReadResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
      readonly snapshot: Snapshot;
      /** 文件原来的版本比当前旧时是原来的版本（已在内存里迁移），否则为 null。 */
      readonly migratedFrom: number | null;
      /** 不影响使用的问题，比如 Concept 的未知字段、正文缺少约定的章节。 */
      readonly warnings: StoreIssue[];
    }
  | {
      readonly ok: false;
      /** 文件是更新版本的 Mastery OS 写的：只能读，store 不会修改它。 */
      readonly readOnly: boolean;
      readonly issues: StoreIssue[];
    };

/** 写入的结果。 */
export type WriteResult =
  | {
      readonly ok: true;
      /** 是否真的写了文件（内容没变时不写）。 */
      readonly written: boolean;
      /** 写入后的文件，下一次保存用它作 `base`。 */
      readonly snapshot: Snapshot;
    }
  | { readonly ok: false; readonly issues: StoreIssue[] };

/** 列出目录的结果。 */
export interface ListResult {
  /** 合法的 ID，按名字排序。 */
  readonly ids: string[];
  /** 不认识的文件名、缺少的文件。以 `.` 开头的名字直接忽略。 */
  readonly issues: StoreIssue[];
}

/** 保存可修改文件的选项。 */
export interface SaveOptions {
  /**
   * 读取时得到的 {@link Snapshot}。
   * - 给了：更新已有的文件。磁盘上的内容和读取时不同（被别的程序改过或删掉）时，
   *   报 `store.modified_since_read`，不写入。只改动变化的部分，注释和格式保留。
   * - 没给：创建新文件，写成规范形式。文件已存在时报 `store.already_exists`。
   */
  readonly base?: Snapshot;
}

/** 可以修改的单个文件（`workspace.yaml`）。 */
export interface EditableFile<T> {
  read(): Promise<ReadResult<T> | null>;
  save(value: T, options?: SaveOptions): Promise<WriteResult>;
}

/** 可以修改的一类文件，用 ID（slug 或 ULID）区分。 */
export interface EditableCollection<T> {
  list(): Promise<ListResult>;
  read(id: string): Promise<ReadResult<T> | null>;
  save(value: T, options?: SaveOptions): Promise<WriteResult>;
}

/**
 * 只能追加的一类文件（不变量 2）：只有 `append`，没有修改和删除。
 * `append` 用独占创建写入，ID 已存在时报 `store.already_exists`，不依赖写锁。
 */
export interface AppendOnlyCollection<T> {
  list(conceptId: string): Promise<ListResult>;
  read(conceptId: string, id: string): Promise<ReadResult<T> | null>;
  append(value: T): Promise<WriteResult>;
}

/** 派生的掌握度投影：只由 Mastery Core 写出（不变量 4 由 knowledge 服务保证）。 */
export interface MasteryFiles {
  list(): Promise<ListResult>;
  read(conceptId: string): Promise<ReadResult<MasteryProjection> | null>;
  /** 写成规范形式，覆盖原来的内容（手工修改会被重算覆盖）。原文件版本过新时拒绝。 */
  write(value: MasteryProjection): Promise<WriteResult>;
}

/** 掌握度历史：每个 Concept 一个 `.jsonl` 文件，只追加。 */
export interface HistoryFiles {
  read(conceptId: string): Promise<ReadResult<MasteryHistoryEntry[]> | null>;
  /**
   * 在文件末尾追加一行，已有的字节保持不变。已有的行有问题（包括版本过新）时拒绝。
   * 同时追加同一个文件需要写锁（4.1）。
   */
  append(conceptId: string, entry: MasteryHistoryEntry): Promise<WriteResult>;
}

/** Workspace 里所有文件的读写入口。 */
export interface Store {
  readonly workspace: EditableFile<WorkspaceConfig>;
  readonly projects: EditableCollection<ProjectConfig>;
  readonly concepts: EditableCollection<Concept>;
  /** 按 Concept 的 slug 区分。 */
  readonly criteria: EditableCollection<Criteria>;
  readonly blindspots: EditableCollection<Blindspot>;
  readonly interventions: EditableCollection<Intervention>;
  readonly sessions: AppendOnlyCollection<AssessmentSession>;
  readonly evidence: AppendOnlyCollection<Evidence>;
  readonly mastery: MasteryFiles;
  readonly history: HistoryFiles;
}

/** {@link createStore} 的选项。 */
export interface StoreOptions {
  /**
   * 替换 schema 的 `validateFile`。**只给测试用**：现在还没有真正的迁移，
   * 测试用它模拟旧版本的文件。
   *
   * @internal
   */
  readonly validateFile?: (
    kind: FileKind,
    data: unknown,
  ) => FileValidationResult<unknown>;
}

type Format = 'yaml' | 'json' | 'concept';

/** 列目录时对一个名字的判断。 */
type Accepted = { readonly id: string } | 'unexpected' | 'skip';

/** 解析成功的文件。 */
interface ParsedFile {
  readonly data: unknown;
  readonly yaml: YamlParsed | null;
  readonly parts: FrontmatterParts | null;
}

/** 一类文件的规则。 */
interface Spec<T> {
  readonly kind: FileKind;
  readonly format: Format;
  /** 值里能决定文件位置的字段：字段路径和取值。和文件位置不一致时报 `store.path_mismatch`。 */
  readonly identity: (
    value: T,
  ) => readonly (readonly [readonly string[], string])[];
  /** 文件位置。 */
  readonly pathOf: (value: T) => string;
  /** 校验后的数据加上解析结果，组成值（Concept 加上正文）。 */
  readonly wrap: (data: unknown, source: ParsedFile | T) => T;
  /** 值里要校验的部分（Concept 只校验 frontmatter）。 */
  readonly unwrap: (value: T) => unknown;
  /** schema 问题的字段路径前缀。 */
  readonly prefix: readonly string[];
  readonly warnings?: (value: T, file: string) => StoreIssue[];
}

const asIs = <T>(data: unknown) => data as T;

/** 读到的问题里有没有“版本过新”。 */
const tooNew = <I extends { readonly code: string }>(issues: readonly I[]) =>
  issues.find((issue) => issue.code === 'migration.version_too_new');

/**
 * 创建 store。所有 I/O 都通过 Platform 的 {@link FileSystem}，路径相对于 Workspace 根目录。
 *
 * @param fs - 以 Workspace 根目录为根的文件系统
 * @param options - 测试用的选项
 */
export function createStore(fs: FileSystem, options: StoreOptions = {}): Store {
  const validate = options.validateFile ?? validateFile;

  async function readText(file: string): Promise<string | null> {
    try {
      return await fs.readTextFile(file);
    } catch (error) {
      if (isPlatformError(error, 'platform.not_found')) return null;
      throw error;
    }
  }

  async function snapshot(path: string, text: string): Promise<Snapshot> {
    return { path, sha256: await sha256Hex(text) };
  }

  function parse(
    format: Format,
    file: string,
    text: string,
  ): { ok: true; file: ParsedFile } | { ok: false; issues: StoreIssue[] } {
    if (format === 'json') {
      try {
        return {
          ok: true,
          file: { data: JSON.parse(text) as unknown, yaml: null, parts: null },
        };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          issues: [storeIssue(file, 'json.syntax', { detail })],
        };
      }
    }
    let parts: FrontmatterParts | null = null;
    let yamlText = text;
    if (format === 'concept') {
      const split = splitFrontmatter(text);
      if (!split.ok)
        return { ok: false, issues: [storeIssue(file, split.code)] };
      parts = split.parts;
      yamlText = parts.yaml;
    }
    const yaml = parseYaml(yamlText);
    if (!yaml.ok) {
      // frontmatter 的行号从文件的第二行算起。
      const offset = parts === null ? 0 : 1;
      return {
        ok: false,
        issues: yaml.issues.map((issue) =>
          fromRawIssue(file, {
            ...issue,
            params:
              typeof issue.params.line === 'number'
                ? { ...issue.params, line: issue.params.line + offset }
                : issue.params,
          }),
        ),
      };
    }
    return { ok: true, file: { data: yaml.data, yaml, parts } };
  }

  function schemaIssues<T>(
    spec: Spec<T>,
    file: string,
    issues: readonly SchemaIssue[],
  ): StoreIssue[] {
    return issues.map((issue) => fromSchemaIssue(file, issue, spec.prefix));
  }

  function mismatches<T>(
    spec: Spec<T>,
    file: string,
    expected: readonly string[],
    value: T,
  ): StoreIssue[] {
    return spec.identity(value).flatMap(([path, actual], index) =>
      actual === expected[index]
        ? []
        : [
            storeIssue(
              file,
              'store.path_mismatch',
              {
                field: path.join('.'),
                expected: expected[index] ?? '',
                actual,
              },
              path,
            ),
          ],
    );
  }

  async function read<T>(
    spec: Spec<T>,
    file: string,
    key: readonly string[],
  ): Promise<ReadResult<T> | null> {
    let text: string | null;
    try {
      text = await readText(file);
    } catch (error) {
      if (isPlatformError(error, 'platform.invalid_encoding')) {
        return {
          ok: false,
          readOnly: false,
          issues: [storeIssue(file, 'store.invalid_encoding')],
        };
      }
      throw error;
    }
    if (text === null) return null;
    const parsed = parse(spec.format, file, text);
    if (!parsed.ok)
      return { ok: false, readOnly: false, issues: parsed.issues };
    const result = validate(spec.kind, parsed.file.data);
    if (!result.success) {
      return {
        ok: false,
        readOnly: tooNew(result.issues) !== undefined,
        issues: schemaIssues(spec, file, result.issues),
      };
    }
    const value = spec.wrap(result.data, parsed.file);
    const wrong = mismatches(spec, file, key, value);
    if (wrong.length > 0) return { ok: false, readOnly: false, issues: wrong };
    return {
      ok: true,
      value,
      snapshot: await snapshot(file, text),
      migratedFrom: result.from < result.to ? result.from : null,
      warnings: spec.warnings?.(value, file) ?? [],
    };
  }

  /** 校验要写入的值，返回校验后的值和它的位置。 */
  function prepare<T>(
    spec: Spec<T>,
    value: T,
    fallbackFile: string | undefined,
  ):
    { ok: true; value: T; file: string } | { ok: false; issues: StoreIssue[] } {
    const result = validate(spec.kind, spec.unwrap(value));
    if (!result.success) {
      const file = fallbackFile ?? safePath(spec, value);
      return { ok: false, issues: schemaIssues(spec, file, result.issues) };
    }
    const next = spec.wrap(result.data, value);
    return { ok: true, value: next, file: spec.pathOf(next) };
  }

  function serializeNew<T>(spec: Spec<T>, value: T): string {
    const data = spec.unwrap(value);
    if (spec.format === 'json') return `${JSON.stringify(data, null, 2)}\n`;
    const yaml = stringifyYaml(data);
    if (spec.format === 'yaml') return yaml;
    return joinFrontmatter({
      bom: '',
      eol: '\n',
      yaml,
      closing: '---\n',
      body: (value as Concept).body,
    });
  }

  function serializePatch<T>(
    spec: Spec<T>,
    current: string,
    parsed: ParsedFile,
    value: T,
  ): string {
    const data = spec.unwrap(value);
    if (parsed.yaml === null) return serializeNew(spec, value);
    if (parsed.parts === null) return patchYaml(current, parsed.yaml, data);
    return joinFrontmatter({
      ...parsed.parts,
      yaml: patchYaml(parsed.parts.yaml, parsed.yaml, data, parsed.parts.eol),
      body: (value as Concept).body,
    });
  }

  /** 独占创建（必要时先建父目录）。已存在时返回 `store.already_exists`。 */
  async function create(file: string, text: string): Promise<WriteResult> {
    const parent = parentPath(file);
    if (parent !== '') await fs.mkdir(parent, { recursive: true });
    try {
      await fs.createTextFile(file, text);
    } catch (error) {
      if (isPlatformError(error, 'platform.already_exists')) {
        return {
          ok: false,
          issues: [storeIssue(file, 'store.already_exists')],
        };
      }
      throw error;
    }
    return { ok: true, written: true, snapshot: await snapshot(file, text) };
  }

  async function save<T>(
    spec: Spec<T>,
    value: T,
    saveOptions: SaveOptions = {},
  ): Promise<WriteResult> {
    const base = saveOptions.base;
    const prepared = prepare(spec, value, base?.path);
    if (!prepared.ok) return prepared;
    const { file } = prepared;
    if (base === undefined)
      return create(file, serializeNew(spec, prepared.value));

    if (base.path !== file) {
      return {
        ok: false,
        issues: [
          storeIssue(base.path, 'store.path_mismatch', {
            field: 'path',
            expected: base.path,
            actual: file,
          }),
        ],
      };
    }
    const current = await readText(file);
    if (current === null || (await sha256Hex(current)) !== base.sha256) {
      return {
        ok: false,
        issues: [storeIssue(file, 'store.modified_since_read')],
      };
    }
    const parsed = parse(spec.format, file, current);
    if (!parsed.ok) return parsed;
    const existing = validate(spec.kind, parsed.file.data);
    if (!existing.success) {
      const newer = tooNew(existing.issues);
      return {
        ok: false,
        issues:
          newer === undefined
            ? schemaIssues(spec, file, existing.issues)
            : [versionTooNew(file, newer)],
      };
    }
    // 旧版本的文件按当前版本的规范形式写出（结构可能已经变了，不能在旧文档上修改）。
    const text =
      existing.from < existing.to
        ? serializeNew(spec, prepared.value)
        : serializePatch(spec, current, parsed.file, prepared.value);
    if (text === current) return { ok: true, written: false, snapshot: base };
    await fs.writeTextFile(file, text);
    return { ok: true, written: true, snapshot: await snapshot(file, text) };
  }

  async function append<T>(spec: Spec<T>, value: T): Promise<WriteResult> {
    const prepared = prepare(spec, value, undefined);
    if (!prepared.ok) return prepared;
    return create(prepared.file, serializeNew(spec, prepared.value));
  }

  /**
   * 列出目录。`accept` 返回 `{ id }`（合法）、`'unexpected'`（不认识，报 `store.unexpected_file`）
   * 或 `'skip'`（忽略）。目录不存在时返回空列表。
   */
  async function list(
    dir: string,
    accept: (name: string, kind: 'file' | 'directory') => Accepted,
    check?: (id: string) => Promise<StoreIssue | null>,
  ): Promise<ListResult> {
    let entries;
    try {
      entries = await fs.list(dir);
    } catch (error) {
      if (isPlatformError(error, 'platform.not_found'))
        return { ids: [], issues: [] };
      throw error;
    }
    const ids: string[] = [];
    const issues: StoreIssue[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const accepted = accept(entry.name, entry.kind);
      if (accepted === 'skip') continue;
      if (accepted === 'unexpected') {
        issues.push(
          storeIssue(`${dir}/${entry.name}`, 'store.unexpected_file'),
        );
        continue;
      }
      const { id } = accepted;
      const problem = check === undefined ? null : await check(id);
      if (problem === null) ids.push(id);
      else issues.push(problem);
    }
    return { ids, issues };
  }

  const fileNamed =
    (isId: (id: string) => boolean, extension: string) =>
    (name: string, kind: 'file' | 'directory'): Accepted => {
      if (kind !== 'file' || !name.endsWith(extension)) return 'unexpected';
      const id = name.slice(0, -extension.length);
      return isId(id) ? { id } : 'unexpected';
    };
  const dirNamed = (name: string, kind: 'file' | 'directory'): Accepted =>
    kind === 'directory' && isSlug(name) ? { id: name } : 'unexpected';

  function editable<T>(
    spec: Spec<T>,
    pathOf: (id: string) => string,
    listAll: () => Promise<ListResult>,
  ): EditableCollection<T> {
    return {
      list: listAll,
      read: (id) => read(spec, pathOf(id), [id]),
      save: (value, saveOptions) => save(spec, value, saveOptions),
    };
  }

  function appendOnly<T>(
    spec: Spec<T>,
    dirOf: (conceptId: string) => string,
  ): AppendOnlyCollection<T> {
    return {
      list: (conceptId) => list(dirOf(conceptId), fileNamed(isUlid, '.json')),
      read: (conceptId, id) =>
        read(spec, `${dirOf(conceptId)}/${id}.json`, [conceptId, id]),
      append: (value) => append(spec, value),
    };
  }

  const exists = (file: string, missing: string) => async () =>
    (await fs.stat(file)) === null
      ? storeIssue(missing, 'store.missing_file')
      : null;

  const projectPath = (id: string) => `projects/${id}/project.yaml`;
  const conceptPath = (id: string) => `concepts/${id}.md`;
  const criteriaPath = (id: string) => `assessments/${id}/criteria.yaml`;
  const blindspotPath = (id: string) => `blindspots/${id}.yaml`;
  const interventionPath = (id: string) => `interventions/${id}.yaml`;
  const masteryPath = (id: string) => `mastery/${id}.yaml`;
  const historyPath = (id: string) => `mastery/history/${id}.jsonl`;
  const sessionsDir = (id: string) => `assessments/${id}/sessions`;
  const evidenceDir = (id: string) => `evidence/${id}`;

  const WORKSPACE: Spec<WorkspaceConfig> = yamlSpec(
    'workspace',
    () => [],
    () => 'workspace.yaml',
  );
  const PROJECT: Spec<ProjectConfig> = yamlSpec(
    'project',
    (v) => [[['id'], v.id]],
    (v) => projectPath(v.id),
  );
  const CRITERIA: Spec<Criteria> = yamlSpec(
    'criteria',
    (v) => [[['concept_id'], v.concept_id]],
    (v) => criteriaPath(v.concept_id),
  );
  const BLINDSPOT: Spec<Blindspot> = yamlSpec(
    'blindspot',
    (v) => [[['id'], v.id]],
    (v) => blindspotPath(v.id),
  );
  const INTERVENTION: Spec<Intervention> = yamlSpec(
    'intervention',
    (v) => [[['id'], v.id]],
    (v) => interventionPath(v.id),
  );
  const MASTERY: Spec<MasteryProjection> = yamlSpec(
    'mastery-projection',
    (v) => [[['concept_id'], v.concept_id]],
    (v) => masteryPath(v.concept_id),
  );
  const SESSION: Spec<AssessmentSession> = jsonSpec(
    'assessment-session',
    (v) => `${sessionsDir(v.concept_id)}/${v.id}.json`,
  );
  const EVIDENCE: Spec<Evidence> = jsonSpec(
    'evidence',
    (v) => `${evidenceDir(v.concept_id)}/${v.id}.json`,
  );
  const CONCEPT: Spec<Concept> = {
    kind: 'concept-frontmatter',
    format: 'concept',
    identity: (v) => [[['frontmatter', 'id'], v.frontmatter.id]],
    pathOf: (v) => conceptPath(v.frontmatter.id),
    wrap: (data, source) => ({
      frontmatter: data as ConceptFrontmatter,
      body: 'body' in source ? source.body : (source.parts?.body ?? ''),
    }),
    unwrap: (v) => v.frontmatter,
    prefix: ['frontmatter'],
    warnings: (v, file) =>
      [
        ...conceptFrontmatterWarnings(v.frontmatter),
        ...parseConceptBody(v.body).warnings,
      ].map((issue) => fromSchemaIssue(file, issue)),
  };

  const HISTORY_KIND = 'mastery-history-entry';

  /** 解析 history 文件的每一行。 */
  function parseHistory(file: string, text: string) {
    const lines = text.split('\n');
    if (lines.at(-1) === '') lines.pop();
    const entries: MasteryHistoryEntry[] = [];
    const issues: StoreIssue[] = [];
    let oldest: number | null = null;
    let newer: SchemaIssue | undefined;
    lines.forEach((raw, index) => {
      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
      let data: unknown;
      try {
        data = JSON.parse(line);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        issues.push(storeIssue(file, 'json.syntax', { detail }, [index]));
        return;
      }
      const result = validate(HISTORY_KIND, data);
      if (!result.success) {
        newer ??= tooNew(result.issues);
        issues.push(
          ...result.issues.map((issue) =>
            fromSchemaIssue(file, issue, [index]),
          ),
        );
        return;
      }
      if (result.from < result.to)
        oldest = Math.min(oldest ?? result.from, result.from);
      entries.push(result.data as MasteryHistoryEntry);
    });
    return { entries, issues, oldest, newer };
  }

  return {
    workspace: {
      read: () => read(WORKSPACE, 'workspace.yaml', []),
      save: (value, saveOptions) => save(WORKSPACE, value, saveOptions),
    },
    projects: editable(PROJECT, projectPath, () =>
      list('projects', dirNamed, (id) =>
        exists(projectPath(id), projectPath(id))(),
      ),
    ),
    concepts: editable(CONCEPT, conceptPath, () =>
      list('concepts', fileNamed(isSlug, '.md')),
    ),
    criteria: editable(CRITERIA, criteriaPath, async () => {
      const dirs = await list('assessments', dirNamed);
      const ids: string[] = [];
      for (const id of dirs.ids) {
        if ((await fs.stat(criteriaPath(id))) !== null) ids.push(id);
      }
      return { ids, issues: dirs.issues };
    }),
    blindspots: editable(BLINDSPOT, blindspotPath, () =>
      list('blindspots', fileNamed(isUlid, '.yaml')),
    ),
    interventions: editable(INTERVENTION, interventionPath, () =>
      list('interventions', fileNamed(isUlid, '.yaml')),
    ),
    sessions: appendOnly(SESSION, sessionsDir),
    evidence: appendOnly(EVIDENCE, evidenceDir),
    mastery: {
      list: () =>
        list('mastery', (name, kind) =>
          kind === 'directory' && name === 'history'
            ? 'skip'
            : fileNamed(isSlug, '.yaml')(name, kind),
        ),
      read: (conceptId) => read(MASTERY, masteryPath(conceptId), [conceptId]),
      write: async (value) => {
        const prepared = prepare(MASTERY, value, undefined);
        if (!prepared.ok) return prepared;
        const { file } = prepared;
        const text = serializeNew(MASTERY, prepared.value);
        const current = await readText(file);
        if (current !== null) {
          const parsed = parse('yaml', file, current);
          if (parsed.ok) {
            const existing = validate(MASTERY.kind, parsed.file.data);
            const newer = existing.success
              ? undefined
              : tooNew(existing.issues);
            if (newer !== undefined) {
              return { ok: false, issues: [versionTooNew(file, newer)] };
            }
          }
          if (current === text) {
            return {
              ok: true,
              written: false,
              snapshot: await snapshot(file, text),
            };
          }
        } else {
          await fs.mkdir(parentPath(file), { recursive: true });
        }
        await fs.writeTextFile(file, text);
        return {
          ok: true,
          written: true,
          snapshot: await snapshot(file, text),
        };
      },
    },
    history: {
      read: async (conceptId) => {
        const file = historyPath(conceptId);
        const text = await readText(file);
        if (text === null) return null;
        const { entries, issues, oldest, newer } = parseHistory(file, text);
        if (issues.length > 0) {
          return { ok: false, readOnly: newer !== undefined, issues };
        }
        return {
          ok: true,
          value: entries,
          snapshot: await snapshot(file, text),
          migratedFrom: oldest,
          warnings: [],
        };
      },
      append: async (conceptId, entry) => {
        const file = historyPath(conceptId);
        if (!isSlug(conceptId)) {
          return {
            ok: false,
            issues: [
              storeIssue(file, 'store.path_mismatch', {
                field: 'concept_id',
                expected: 'a slug',
                actual: conceptId,
              }),
            ],
          };
        }
        const result = validate(HISTORY_KIND, entry);
        if (!result.success) {
          return {
            ok: false,
            issues: result.issues.map((issue) => fromSchemaIssue(file, issue)),
          };
        }
        const line = `${JSON.stringify(result.data)}\n`;
        const current = await readText(file);
        if (current === null) {
          const created = await create(file, line);
          // 别人刚好也在创建这个文件：按“读取之后被改过”处理，调用者重试即可。
          return created.ok
            ? created
            : {
                ok: false,
                issues: [storeIssue(file, 'store.modified_since_read')],
              };
        }
        const { issues, newer } = parseHistory(file, current);
        if (newer !== undefined) {
          return { ok: false, issues: [versionTooNew(file, newer)] };
        }
        if (issues.length > 0) return { ok: false, issues };
        const separator = current === '' || current.endsWith('\n') ? '' : '\n';
        const text = current + separator + line;
        await fs.writeTextFile(file, text);
        return {
          ok: true,
          written: true,
          snapshot: await snapshot(file, text),
        };
      },
    },
  };
}

function yamlSpec<T>(
  kind: FileKind,
  identity: Spec<T>['identity'],
  pathOf: (value: T) => string,
): Spec<T> {
  return {
    kind,
    format: 'yaml',
    identity,
    pathOf,
    wrap: asIs,
    unwrap: (value) => value,
    prefix: [],
  };
}

function jsonSpec<
  T extends { readonly id: string; readonly concept_id: string },
>(kind: FileKind, pathOf: (value: T) => string): Spec<T> {
  return {
    kind,
    format: 'json',
    identity: (v) => [
      [['concept_id'], v.concept_id],
      [['id'], v.id],
    ],
    pathOf,
    wrap: asIs,
    unwrap: (value) => value,
    prefix: [],
  };
}

/** 值不合法时，问题里报告的文件路径：尽量按值算出来，算不出来就用规则描述。 */
function safePath<T>(spec: Spec<T>, value: T): string {
  try {
    return spec.pathOf(value);
  } catch {
    return spec.kind;
  }
}

function versionTooNew(
  file: string,
  issue: { readonly params: Readonly<Record<string, unknown>> },
): StoreIssue {
  const version = issue.params.version;
  const latest = issue.params.latest;
  return storeIssue(file, 'store.version_too_new', {
    version: typeof version === 'number' ? version : String(version),
    latest: typeof latest === 'number' ? latest : String(latest),
  });
}

function isSlug(value: string): boolean {
  return Slug.safeParse(value).success;
}

function isUlid(value: string): boolean {
  return Ulid.safeParse(value).success;
}
