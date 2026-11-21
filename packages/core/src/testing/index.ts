/**
 * 测试工具（`@mastery/core/testing`）：内存里的 {@link Repository}、事件记录器和规则表。
 * 内存 Repository 和 `@mastery/core-store` 的真实实现通过同一套契约测试（`@mastery/core/contract`），
 * 所以 Core 的测试结论对真实的实现同样成立。
 */
import {
  validateFile,
  type FileKind,
  type MasteryHistoryEntry,
  type SchemaIssue,
} from '@mastery/schema';

import type { RepositoryIssue } from '../errors.js';
import type { DomainEvent, EventSink } from '../events.js';
import type { Aggregate, Rules } from '../ports.js';
import type {
  EvidenceList,
  Repository,
  RepositoryRead,
  UnusableEvidence,
} from '../repository.js';

/**
 * 准备测试数据：直接写入文件，**不经过 Repository，也不校验**，所以可以写入不合法或版本过新的内容。
 * 每个参数都是文件的完整内容（解析后的数据）。
 */
export interface RepositorySeed {
  /** `concepts/<slug>.md` 的 frontmatter（正文由实现决定）。 */
  concept(slug: string, frontmatter: unknown): Promise<void>;
  /** `assessments/<slug>/criteria.yaml`。 */
  criteria(slug: string, data: unknown): Promise<void>;
  /** `assessments/<slug>/sessions/<id>.json`。 */
  session(slug: string, id: string, data: unknown): Promise<void>;
  /** `evidence/<slug>/<id>.json`。 */
  evidence(slug: string, id: string, data: unknown): Promise<void>;
  /** `mastery/<slug>.yaml`。 */
  mastery(slug: string, data: unknown): Promise<void>;
  /** `mastery/history/<slug>.jsonl`，每一项是一行。 */
  history(slug: string, lines: readonly unknown[]): Promise<void>;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const toIssue = (file: string, issue: SchemaIssue): RepositoryIssue => ({
  file,
  code: issue.code,
  path: issue.path,
  message: issue.message,
});

const isTooNew = (issues: readonly { readonly code: string }[]) =>
  issues.some((issue) => issue.code === 'migration.version_too_new');

/** 校验一个文件的数据，并检查内容和文件位置一致。 */
function check<T>(
  kind: FileKind,
  data: unknown,
  file: string,
  identity: readonly (readonly [field: string, expected: string])[],
): RepositoryRead<T> {
  const result = validateFile(kind, data);
  if (!result.success) {
    return {
      kind: 'unreadable',
      tooNew: isTooNew(result.issues),
      issues: result.issues.map((issue) => toIssue(file, issue)),
    };
  }
  const value = result.data as Record<string, unknown>;
  const wrong = identity.filter(
    ([field, expected]) => value[field] !== expected,
  );
  if (wrong.length > 0) {
    return {
      kind: 'unreadable',
      tooNew: false,
      issues: wrong.map(([field, expected]) => ({
        file,
        code: 'repository.path_mismatch',
        path: [field],
        message: `"${field}" is "${String(value[field])}" but the file location says "${expected}"`,
      })),
    };
  }
  return { kind: 'found', value: clone(result.data) as T };
}

/** 内存里的 Workspace：store 的规则（校验、路径一致、只追加、版本过新只读）在这里同样成立。 */
export interface MemoryRepository {
  readonly repository: Repository;
  readonly seed: RepositorySeed;
}

/** 创建一个空的内存 Repository。 */
export function createMemoryRepository(): MemoryRepository {
  const files = new Map<string, unknown>();
  const history = new Map<string, unknown[]>();
  const get = (file: string) =>
    files.has(file) ? { data: files.get(file) } : null;

  const conceptFile = (slug: string) => `concepts/${slug}.md`;
  const criteriaFile = (slug: string) => `assessments/${slug}/criteria.yaml`;
  const sessionFile = (slug: string, id: string) =>
    `assessments/${slug}/sessions/${id}.json`;
  const evidenceFile = (slug: string, id: string) =>
    `evidence/${slug}/${id}.json`;
  const masteryFile = (slug: string) => `mastery/${slug}.yaml`;
  const historyFile = (slug: string) => `mastery/history/${slug}.jsonl`;

  function read<T>(
    kind: FileKind,
    file: string,
    identity: readonly (readonly [string, string])[],
  ): Promise<RepositoryRead<T>> {
    const stored = get(file);
    return Promise.resolve(
      stored === null
        ? { kind: 'missing' }
        : check<T>(kind, stored.data, file, identity),
    );
  }

  function readHistory(
    slug: string,
  ): RepositoryRead<readonly MasteryHistoryEntry[]> {
    const lines = history.get(slug);
    if (lines === undefined) return { kind: 'missing' };
    const file = historyFile(slug);
    const entries: MasteryHistoryEntry[] = [];
    const issues: RepositoryIssue[] = [];
    lines.forEach((line, index) => {
      const result = validateFile('mastery-history-entry', line);
      if (result.success) entries.push(clone<MasteryHistoryEntry>(result.data));
      else
        issues.push(
          ...result.issues.map((issue) => ({
            ...toIssue(file, issue),
            path: [index, ...issue.path],
          })),
        );
    });
    if (issues.length > 0)
      return { kind: 'unreadable', tooNew: isTooNew(issues), issues };
    return { kind: 'found', value: entries };
  }

  const repository: Repository = {
    getConcept: (slug) =>
      read('concept-frontmatter', conceptFile(slug), [['id', slug]]),
    getCriteria: (slug) =>
      read('criteria', criteriaFile(slug), [['concept_id', slug]]),
    getSession: (slug, id) =>
      read('assessment-session', sessionFile(slug, id), [
        ['concept_id', slug],
        ['id', id],
      ]),

    listEvidence(slug) {
      const prefix = `evidence/${slug}/`;
      const items: EvidenceList['items'][number][] = [];
      const tooNew: UnusableEvidence[] = [];
      const unreadable: UnusableEvidence[] = [];
      const names = [...files.keys()]
        .filter((file) => file.startsWith(prefix))
        .sort();
      for (const file of names) {
        const id = file.slice(prefix.length, -'.json'.length);
        const result = check<EvidenceList['items'][number]>(
          'evidence',
          files.get(file),
          file,
          [
            ['concept_id', slug],
            ['id', id],
          ],
        );
        if (result.kind === 'found') items.push(result.value);
        else if (result.kind === 'unreadable') {
          (result.tooNew ? tooNew : unreadable).push({
            file,
            id,
            issues: result.issues,
          });
        }
      }
      items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return Promise.resolve({ items, tooNew, unreadable });
    },

    appendEvidence(evidence) {
      const result = validateFile('evidence', evidence);
      if (!result.success) {
        const file = evidenceFile(
          String(evidence.concept_id),
          String(evidence.id),
        );
        return Promise.resolve({
          ok: false,
          reason: 'invalid',
          issues: result.issues.map((issue) => toIssue(file, issue)),
        });
      }
      const file = evidenceFile(result.data.concept_id, result.data.id);
      if (files.has(file))
        return Promise.resolve({ ok: false, reason: 'exists' });
      files.set(file, clone(result.data));
      return Promise.resolve({ ok: true });
    },

    getMastery: (slug) =>
      read('mastery-projection', masteryFile(slug), [['concept_id', slug]]),

    writeMastery(projection) {
      const file = masteryFile(String(projection.concept_id));
      const result = validateFile('mastery-projection', projection);
      if (!result.success) {
        return Promise.resolve({
          ok: false,
          reason: 'invalid',
          issues: result.issues.map((issue) => toIssue(file, issue)),
        });
      }
      const existing = get(file);
      if (existing !== null) {
        const current = validateFile('mastery-projection', existing.data);
        if (!current.success && isTooNew(current.issues)) {
          return Promise.resolve({
            ok: false,
            reason: 'too_new',
            issues: current.issues.map((issue) => toIssue(file, issue)),
          });
        }
        if (JSON.stringify(existing.data) === JSON.stringify(result.data)) {
          return Promise.resolve({ ok: true, written: false });
        }
      }
      files.set(file, clone(result.data));
      return Promise.resolve({ ok: true, written: true });
    },

    getHistory: (slug) => Promise.resolve(readHistory(slug)),

    writeHistory(slug, entries) {
      const file = historyFile(slug);
      const validated: MasteryHistoryEntry[] = [];
      const issues: RepositoryIssue[] = [];
      entries.forEach((entry, index) => {
        const result = validateFile('mastery-history-entry', entry);
        if (result.success) validated.push(clone(result.data));
        else
          issues.push(
            ...result.issues.map((issue) => ({
              ...toIssue(file, issue),
              path: [index, ...issue.path],
            })),
          );
      });
      if (issues.length > 0) {
        return Promise.resolve({ ok: false, reason: 'invalid', issues });
      }
      const current = readHistory(slug);
      if (current.kind === 'unreadable' && current.tooNew) {
        return Promise.resolve({
          ok: false,
          reason: 'too_new',
          issues: current.issues,
        });
      }
      const existing = history.get(slug);
      if (existing === undefined && validated.length === 0) {
        return Promise.resolve({ ok: true, written: false });
      }
      if (
        existing !== undefined &&
        JSON.stringify(existing) === JSON.stringify(validated)
      ) {
        return Promise.resolve({ ok: true, written: false });
      }
      history.set(slug, validated);
      return Promise.resolve({ ok: true, written: true });
    },
  };

  const put = (file: string, data: unknown) => {
    files.set(file, clone(data));
    return Promise.resolve();
  };
  const seed: RepositorySeed = {
    concept: (slug, data) => put(conceptFile(slug), data),
    criteria: (slug, data) => put(criteriaFile(slug), data),
    session: (slug, id, data) => put(sessionFile(slug, id), data),
    evidence: (slug, id, data) => put(evidenceFile(slug, id), data),
    mastery: (slug, data) => put(masteryFile(slug), data),
    history: (slug, lines) => {
      history.set(slug, clone([...lines]));
      return Promise.resolve();
    },
  };
  return { repository, seed };
}

/** 记录发出的事件和监听者的错误，测试用。 */
export interface EventRecorder extends EventSink {
  readonly events: DomainEvent[];
  readonly errors: { readonly error: unknown; readonly event: DomainEvent }[];
}

/**
 * 创建一个事件记录器。
 *
 * @param onEmit - 每个事件发出时调用（测试可以让它抛出，模拟出错的监听者）
 */
export function createEventRecorder(
  onEmit?: (event: DomainEvent) => void,
): EventRecorder {
  const events: DomainEvent[] = [];
  const errors: { error: unknown; event: DomainEvent }[] = [];
  return {
    events,
    errors,
    emit(event) {
      events.push(event);
      onEmit?.(event);
    },
    reportError(error, event) {
      errors.push({ error, event });
    },
  };
}

const EMPTY_AGGREGATE: Aggregate = {
  dimensions: {
    recall: null,
    understanding: null,
    reasoning: null,
    application: null,
    transfer: null,
  },
  confidence: 0,
  perDimension: {
    recall: null,
    understanding: null,
    reasoning: null,
    application: null,
    transfer: null,
  },
};

/**
 * 测试用的规则：`aggregate` 总是返回“没有分数”（所有维度 `null`、置信度 0），
 * `evaluate` 总是 `not_assessed`、没有步骤。不关心规则结果的测试用它；要测规则本身，
 * 用规则包（比如 `rules-v1`）。
 *
 * @param version - 规则版本
 */
export function stubRules(version: number): Rules {
  return {
    version,
    evaluate: () => ({
      state: 'not_assessed',
      aggregate: EMPTY_AGGREGATE,
      explanation: [{ code: 'state.not_assessed', params: {} }],
      steps: [],
      reviewDueAt: null,
    }),
    aggregate: () => ({
      dimensions: {
        recall: null,
        understanding: null,
        reasoning: null,
        application: null,
        transfer: null,
      },
      confidence: 0,
      perDimension: {
        recall: null,
        understanding: null,
        reasoning: null,
        application: null,
        transfer: null,
      },
    }),
  };
}

export { createRulesRegistry } from '../rules-registry.js';
