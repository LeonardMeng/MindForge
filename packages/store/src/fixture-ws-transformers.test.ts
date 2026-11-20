// ROADMAP 1.10 的验收：fixtures/ws-transformers 用 store 读取全部文件，没有错误也没有警告（零警告基线），
// 并且所有引用都能找到。这些引用检查以后由 `mastery validate` 正式实现。
import { fixtureFiles, loadFixture } from '@mastery/testkit';
import { describe, expect, it } from 'vitest';

import { createStore, type ReadResult, type Store } from './index.js';

const FILES = fixtureFiles('ws-transformers');

/** 协议里认识的文件。`README.md` 是这个 fixture 的说明，`.gitignore` 是真正的 Workspace 也有的。 */
const KNOWN = [
  /^workspace\.yaml$/,
  /^\.gitignore$/,
  /^README\.md$/,
  /^projects\/[^/]+\/project\.yaml$/,
  /^concepts\/[^/]+\.md$/,
  /^assessments\/[^/]+\/criteria\.yaml$/,
  /^notes\/.+\.md$/,
];

/** 要求读取成功，并且没有警告。 */
function clean<T>(result: ReadResult<T> | null, file: string): T {
  if (result === null) throw new Error(`${file}: not found`);
  expect(result.ok ? result.warnings : result.issues, file).toEqual([]);
  if (!result.ok) throw new Error(`${file}: not readable`);
  return result.value;
}

async function readAll(store: Store) {
  const concepts = await store.concepts.list();
  const projects = await store.projects.list();
  const criteria = await store.criteria.list();
  for (const listed of [concepts, projects, criteria]) {
    expect(listed.issues).toEqual([]);
  }
  return {
    workspace: clean(await store.workspace.read(), 'workspace.yaml'),
    concepts: await Promise.all(
      concepts.ids.map(async (id) =>
        clean(await store.concepts.read(id), `concepts/${id}.md`),
      ),
    ),
    projects: await Promise.all(
      projects.ids.map(async (id) =>
        clean(await store.projects.read(id), `projects/${id}/project.yaml`),
      ),
    ),
    criteria: await Promise.all(
      criteria.ids.map(async (id) =>
        clean(await store.criteria.read(id), `assessments/${id}/criteria.yaml`),
      ),
    ),
  };
}

describe('fixtures/ws-transformers', () => {
  it('contains only files the protocol knows about', () => {
    const unknown = [...FILES.keys()].filter(
      (path) => !KNOWN.some((pattern) => pattern.test(path)),
    );
    expect(unknown).toEqual([]);
  });

  it('reads every file with the store, without errors or warnings', async () => {
    const store = createStore(await loadFixture('ws-transformers'));
    const all = await readAll(store);
    expect(all.workspace.id).toBe('transformers');
    expect(all.concepts).toHaveLength(10);
    expect(all.criteria.map((c) => c.concept_id)).toEqual([
      'multi-head-attention',
      'self-attention',
      'softmax',
    ]);
    expect(all.projects.map((p) => p.id)).toEqual(['read-attention-paper']);
    // 没有 Evidence 等（M2 再加），也没有盲区和干预。
    expect(await store.blindspots.list()).toEqual({ ids: [], issues: [] });
    expect(await store.interventions.list()).toEqual({ ids: [], issues: [] });
    expect(await store.mastery.list()).toEqual({ ids: [], issues: [] });
    for (const concept of all.concepts) {
      const id = concept.frontmatter.id;
      expect(await store.evidence.list(id)).toEqual({ ids: [], issues: [] });
      expect(await store.sessions.list(id)).toEqual({ ids: [], issues: [] });
    }
  });

  it('keeps every byte when each file is saved back unchanged', async () => {
    const fs = await loadFixture('ws-transformers');
    const store = createStore(fs);
    const reads = [
      store.workspace.read(),
      ...(await store.concepts.list()).ids.map((id) => store.concepts.read(id)),
      ...(await store.criteria.list()).ids.map((id) => store.criteria.read(id)),
      ...(await store.projects.list()).ids.map((id) => store.projects.read(id)),
    ];
    for (const read of await Promise.all(reads)) {
      if (read?.ok !== true) throw new Error('not readable');
      const saved = await (
        store as unknown as Record<
          string,
          {
            save(
              v: unknown,
              o: object,
            ): Promise<{ ok: boolean; written?: boolean }>;
          }
        >
      )[collectionOf(read.snapshot.path)]?.save(read.value, {
        base: read.snapshot,
      });
      expect(saved, read.snapshot.path).toMatchObject({
        ok: true,
        written: false,
      });
    }
    for (const [path, text] of FILES) {
      expect(await fs.readTextFile(path), path).toBe(text);
    }
  });

  it('has prerequisites and project concepts that exist, without cycles', async () => {
    const all = await readAll(
      createStore(await loadFixture('ws-transformers')),
    );
    const prerequisites = new Map(
      all.concepts.map((c) => [c.frontmatter.id, c.frontmatter.prerequisites]),
    );
    for (const [id, pre] of prerequisites) {
      for (const p of pre)
        expect(prerequisites.has(p), `${id} → ${p}`).toBe(true);
    }
    for (const project of all.projects) {
      for (const c of project.concepts) {
        expect(prerequisites.has(c), `${project.id} → ${c}`).toBe(true);
      }
    }
    // 拓扑排序：每一轮去掉前置依赖都已处理过的 Concept，最后必须全部处理完。
    const done = new Set<string>();
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const [id, pre] of prerequisites) {
        if (!done.has(id) && pre.every((p) => done.has(p))) {
          done.add(id);
          progressed = true;
        }
      }
    }
    expect([...prerequisites.keys()].filter((id) => !done.has(id))).toEqual([]);
  });

  it('has transformer as the only draft, and no active concept depends on a draft one', async () => {
    const all = await readAll(
      createStore(await loadFixture('ws-transformers')),
    );
    const status = new Map(
      all.concepts.map((c) => [c.frontmatter.id, c.frontmatter.status]),
    );
    expect(
      [...status].filter(([, s]) => s === 'draft').map(([id]) => id),
    ).toEqual(['transformer']);
    for (const c of all.concepts) {
      if (c.frontmatter.status !== 'active') continue;
      for (const p of c.frontmatter.prerequisites) {
        expect(status.get(p), `${c.frontmatter.id} → ${p}`).toBe('active');
      }
    }
  });

  it('has wikilinks that all point to an existing concept or note, and headings that exist', () => {
    // Obsidian 按文件名（不含 .md）解析 wikilink：Concept 的文件名就是 slug。
    const targets = new Map<string, string>();
    for (const [path, text] of FILES) {
      const match = /^(?:concepts|notes)\/(?:.+\/)?([^/]+)\.md$/.exec(path);
      if (match?.[1] === undefined) continue;
      expect(targets.has(match[1]), `two files named ${match[1]}.md`).toBe(
        false,
      );
      targets.set(match[1], text);
    }
    const links: {
      from: string;
      target: string;
      heading: string | undefined;
      alias: boolean;
    }[] = [];
    for (const [path, text] of FILES) {
      if (!/^(concepts|notes)\//.test(path)) continue;
      for (const m of text.matchAll(
        /\[\[([^\]|#]+)(?:#([^\]|]+))?(\|[^\]]+)?\]\]/g,
      )) {
        links.push({
          from: path,
          target: m[1] ?? '',
          heading: m[2],
          alias: m[3] !== undefined,
        });
      }
    }
    expect(links.length).toBeGreaterThanOrEqual(10);
    expect(links.some((l) => l.alias)).toBe(true);
    expect(links.some((l) => l.heading !== undefined)).toBe(true);
    for (const link of links) {
      const target = targets.get(link.target);
      expect(target, `${link.from} → [[${link.target}]]`).toBeDefined();
      if (link.heading !== undefined) {
        const lines = (target ?? '').split('\n');
        expect(
          lines.some(
            (line) =>
              /^#{1,6}\s/.test(line) &&
              line.replace(/^#+\s+/, '').trim() === link.heading,
          ),
          `${link.from} → [[${link.target}#${link.heading}]]`,
        ).toBe(true);
      }
    }
  });
});

/** 文件路径属于 store 的哪个入口。 */
function collectionOf(path: string): string {
  if (path === 'workspace.yaml') return 'workspace';
  if (path.startsWith('concepts/')) return 'concepts';
  if (path.startsWith('projects/')) return 'projects';
  return 'criteria';
}
