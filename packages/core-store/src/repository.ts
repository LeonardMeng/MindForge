import type {
  Repository,
  RepositoryIssue,
  RepositoryRead,
  UnusableEvidence,
} from '@mastery/core';
import { validateFile, type Evidence } from '@mastery/schema';
import type { ReadResult, Store, StoreIssue } from '@mastery/store';

const toIssue = (issue: StoreIssue): RepositoryIssue => ({
  file: issue.file,
  code: issue.code,
  path: issue.path,
  message: issue.message,
});

const hasCode = (issues: readonly StoreIssue[], code: string) =>
  issues.some((issue) => issue.code === code);

/** store 的读取结果 → Repository 的读取结果。 */
function toRead<T, V>(
  result: ReadResult<T> | null,
  map: (value: T) => V,
): RepositoryRead<V> {
  if (result === null) return { kind: 'missing' };
  if (!result.ok) {
    return {
      kind: 'unreadable',
      tooNew: result.readOnly,
      issues: result.issues.map(toIssue),
    };
  }
  return { kind: 'found', value: map(result.value) };
}

const same = <T>(value: T) => value;

const byFile = (a: UnusableEvidence, b: UnusableEvidence) =>
  a.file < b.file ? -1 : a.file > b.file ? 1 : 0;

/**
 * 基于 store 的 {@link Repository}（Core 的端口）。所有读写都经过 store，所以 store 的规则
 * （解析、校验、迁移、路径一致、原子写、Evidence 用独占创建只追加、版本过新只读）在这里同样成立。
 *
 * 和 `@mastery/core/testing` 的内存实现通过同一套契约测试（`@mastery/core/contract`）。
 *
 * @param store - Workspace 的 store
 */
export function createStoreRepository(store: Store): Repository {
  return {
    getConcept: async (conceptId) =>
      toRead(await store.concepts.read(conceptId), (c) => c.frontmatter),

    getCriteria: async (conceptId) =>
      toRead(await store.criteria.read(conceptId), same),

    getSession: async (conceptId, sessionId) =>
      toRead(await store.sessions.read(conceptId, sessionId), same),

    listEvidence: async (conceptId) => {
      const listed = await store.evidence.list(conceptId);
      const items: Evidence[] = [];
      const tooNew: UnusableEvidence[] = [];
      const unreadable: UnusableEvidence[] = [];

      // 不认识的文件名：按文件归在一起，没有 id。
      const unnamed = new Map<string, RepositoryIssue[]>();
      for (const issue of listed.issues) {
        const issues = unnamed.get(issue.file) ?? [];
        issues.push(toIssue(issue));
        unnamed.set(issue.file, issues);
      }
      for (const [file, issues] of unnamed) {
        unreadable.push({ file, id: null, issues });
      }

      for (const id of listed.ids) {
        const read = await store.evidence.read(conceptId, id);
        // list 之后被删掉了：和没有列出来一样。
        if (read === null) continue;
        if (read.ok) {
          items.push(read.value);
          continue;
        }
        const file = read.issues[0]?.file ?? `evidence/${conceptId}/${id}.json`;
        (read.readOnly ? tooNew : unreadable).push({
          file,
          id,
          issues: read.issues.map(toIssue),
        });
      }

      items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return {
        items,
        tooNew: tooNew.sort(byFile),
        unreadable: unreadable.sort(byFile),
      };
    },

    appendEvidence: async (evidence) => {
      const result = await store.evidence.append(evidence);
      if (result.ok) return { ok: true };
      if (hasCode(result.issues, 'store.already_exists')) {
        return { ok: false, reason: 'exists' };
      }
      return {
        ok: false,
        reason: 'invalid',
        issues: result.issues.map(toIssue),
      };
    },

    getMastery: async (conceptId) =>
      toRead(await store.mastery.read(conceptId), same),

    writeMastery: async (projection) => {
      const result = await store.mastery.write(projection);
      if (result.ok) return { ok: true, written: result.written };
      return {
        ok: false,
        reason: hasCode(result.issues, 'store.version_too_new')
          ? 'too_new'
          : 'invalid',
        issues: result.issues.map(toIssue),
      };
    },

    getHistory: async (conceptId) =>
      toRead(await store.history.read(conceptId), (entries) => entries),

    appendHistory: async (conceptId, entry) => {
      // 先校验新的一行，这样“新的一行不合法”和“已有的行有问题”能区分开。
      const checked = validateFile('mastery-history-entry', entry);
      if (!checked.success) {
        const file = `mastery/history/${conceptId}.jsonl`;
        return {
          ok: false,
          reason: 'invalid',
          issues: checked.issues.map((issue) => ({
            file,
            code: issue.code,
            path: issue.path,
            message: issue.message,
          })),
        };
      }
      const result = await store.history.append(conceptId, entry);
      if (result.ok) return { ok: true };
      return {
        ok: false,
        reason: hasCode(result.issues, 'store.version_too_new')
          ? 'too_new'
          : 'unreadable',
        issues: result.issues.map(toIssue),
      };
    },
  };
}
