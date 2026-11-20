import { parentPath } from '@mastery/platform';
import {
  MemoryFileSystem,
  SimulatedCrashError,
} from '@mastery/platform-memory';
import { validateFile, type FileKind } from '@mastery/schema';
import { describe, expect, it } from 'vitest';

import sessionExample from '../../../docs/protocol/examples/assessment-session.json' with { type: 'json' };
import evidenceExample from '../../../docs/protocol/examples/evidence.json' with { type: 'json' };
import historyExample from '../../../docs/protocol/examples/mastery-history-entry.json' with { type: 'json' };
import {
  createStore,
  type ReadResult,
  type SaveOptions,
  type Store,
  type StoreOptions,
  type WriteResult,
} from './index.js';
import { docExample } from './test-helpers.js';

const WORKSPACE = docExample('workspace.md', 'yaml');
const PROJECT = docExample('project.md', 'yaml');
const CRITERIA = docExample('criteria.md', 'yaml');
const BLINDSPOT = docExample('blindspot.md', 'yaml');
const INTERVENTION = docExample('intervention.md', 'yaml');
const MASTERY = docExample('mastery.md', 'yaml');
const CONCEPT = docExample('concept.md', 'markdown');

const BLINDSPOT_ID = '01JD6B0A0A0A0A0A0A0A0A0A0A';
const INTERVENTION_ID = '01JD6C0A0A0A0A0A0A0A0A0A0A';
const EVIDENCE_PATH = `evidence/self-attention/${evidenceExample.id}.json`;

async function setup(
  files: Record<string, string> = {},
  options?: StoreOptions,
): Promise<{ fs: MemoryFileSystem; store: Store }> {
  const fs = new MemoryFileSystem();
  for (const [path, text] of Object.entries(files)) {
    const parent = parentPath(path);
    if (parent !== '') await fs.mkdir(parent, { recursive: true });
    await fs.writeTextFile(path, text);
  }
  return { fs, store: createStore(fs, options) };
}

/** 要求读取成功。 */
function ok<T>(result: ReadResult<T> | null) {
  if (result === null) throw new Error('file not found');
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result;
}

function codes(result: ReadResult<unknown> | WriteResult | null): string[] {
  if (result === null) throw new Error('file not found');
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

describe('editable YAML files', () => {
  it('reads, validates and returns a snapshot with the SHA-256 of the bytes read', async () => {
    const { store } = await setup({ 'workspace.yaml': WORKSPACE });
    const read = ok(await store.workspace.read());
    expect(read.value).toMatchObject({ id: 'ai', name: 'AI' });
    expect(read.snapshot).toEqual({
      path: 'workspace.yaml',
      sha256: await sha256(WORKSPACE),
    });
    expect(read.migratedFrom).toBeNull();
  });

  it('writes nothing and keeps every byte when the value did not change', async () => {
    const { fs, store } = await setup({ 'workspace.yaml': WORKSPACE });
    const read = ok(await store.workspace.read());
    const saved = await store.workspace.save(read.value, {
      base: read.snapshot,
    });
    expect(saved).toMatchObject({ ok: true, written: false });
    expect(await fs.readTextFile('workspace.yaml')).toBe(WORKSPACE);
  });

  it('changes only the edited line, keeping comments and flow style', async () => {
    const { fs, store } = await setup({ 'workspace.yaml': WORKSPACE });
    const read = ok(await store.workspace.read());
    const saved = await store.workspace.save(
      { ...read.value, name: 'AI Lab' },
      { base: read.snapshot },
    );
    expect(saved).toMatchObject({ ok: true, written: true });
    expect(await fs.readTextFile('workspace.yaml')).toBe(
      WORKSPACE.replace('name: AI\n', 'name: AI Lab\n'),
    );
  });

  it('returns a new snapshot that the next save can use', async () => {
    const { store } = await setup({ 'workspace.yaml': WORKSPACE });
    const read = ok(await store.workspace.read());
    const first = await store.workspace.save(
      { ...read.value, name: 'One' },
      { base: read.snapshot },
    );
    if (!first.ok) throw new Error('first save failed');
    const second = await store.workspace.save(
      { ...read.value, name: 'Two' },
      { base: first.snapshot },
    );
    expect(second).toMatchObject({ ok: true, written: true });
    expect(ok(await store.workspace.read()).value.name).toBe('Two');
  });

  it('refuses to overwrite an edit made since the read (store.modified_since_read)', async () => {
    const { fs, store } = await setup({ 'workspace.yaml': WORKSPACE });
    const read = ok(await store.workspace.read());
    const external = WORKSPACE.replace('name: AI', 'name: Edited in VS Code');
    await fs.writeTextFile('workspace.yaml', external);
    const saved = await store.workspace.save(
      { ...read.value, name: 'From the app' },
      { base: read.snapshot },
    );
    expect(codes(saved)).toEqual(['store.modified_since_read']);
    expect(await fs.readTextFile('workspace.yaml')).toBe(external);
  });

  it('refuses to save over a file that was deleted since the read', async () => {
    const { fs, store } = await setup({ 'workspace.yaml': WORKSPACE });
    const read = ok(await store.workspace.read());
    await fs.remove('workspace.yaml');
    const saved = await store.workspace.save(read.value, {
      base: read.snapshot,
    });
    expect(codes(saved)).toEqual(['store.modified_since_read']);
    expect(await fs.stat('workspace.yaml')).toBeNull();
  });

  it('refuses even an unchanged save when the file changed since the read', async () => {
    const { fs, store } = await setup({ 'workspace.yaml': WORKSPACE });
    const read = ok(await store.workspace.read());
    await fs.writeTextFile('workspace.yaml', `${WORKSPACE}# edited\n`);
    const saved = await store.workspace.save(read.value, {
      base: read.snapshot,
    });
    expect(codes(saved)).toEqual(['store.modified_since_read']);
  });

  it('creates a file without a base, and refuses to create one that exists (store.already_exists)', async () => {
    const { fs, store } = await setup();
    const value = ok(
      await (
        await setup({ 'workspace.yaml': WORKSPACE })
      ).store.workspace.read(),
    ).value;
    expect(await store.workspace.save(value)).toMatchObject({
      ok: true,
      written: true,
    });
    const created = await fs.readTextFile('workspace.yaml');
    expect(created.startsWith('schema_version: 1\nid: ai\nname: AI\n')).toBe(
      true,
    );
    expect(codes(await store.workspace.save({ ...value, name: 'X' }))).toEqual([
      'store.already_exists',
    ]);
    expect(await fs.readTextFile('workspace.yaml')).toBe(created);
  });

  it('refuses an invalid value and leaves the file unchanged', async () => {
    const { fs, store } = await setup({ 'workspace.yaml': WORKSPACE });
    const read = ok(await store.workspace.read());
    const saved = await store.workspace.save(
      { ...read.value, id: 'Not A Slug' as typeof read.value.id },
      { base: read.snapshot },
    );
    expect(codes(saved)).not.toEqual([]);
    expect(saved.ok ? [] : saved.issues[0]).toMatchObject({
      file: 'workspace.yaml',
      path: ['id'],
    });
    expect(await fs.readTextFile('workspace.yaml')).toBe(WORKSPACE);
  });

  it('reports YAML that breaks "one value, one form", with the file path', async () => {
    const { store } = await setup({
      'workspace.yaml': 'schema_version: 1\nid: &x ai\nname: *x\n',
    });
    const read = await store.workspace.read();
    expect(read).toMatchObject({ ok: false, readOnly: false });
    expect(read?.ok === false ? read.issues[0] : undefined).toMatchObject({
      file: 'workspace.yaml',
      code: 'yaml.anchor_not_allowed',
      params: { line: 2 },
    });
  });

  it('returns null for a missing file', async () => {
    const { store } = await setup();
    expect(await store.workspace.read()).toBeNull();
    expect(await store.blindspots.read(BLINDSPOT_ID)).toBeNull();
  });

  it('keeps the old content when a save crashes half way (invariant 6)', async () => {
    const { fs, store } = await setup({ 'workspace.yaml': WORKSPACE });
    const read = ok(await store.workspace.read());
    fs.crashOnNextWrite();
    await expect(
      store.workspace.save(
        { ...read.value, name: 'Crash' },
        { base: read.snapshot },
      ),
    ).rejects.toBeInstanceOf(SimulatedCrashError);
    expect(await fs.readTextFile('workspace.yaml')).toBe(WORKSPACE);
  });

  it.each([
    [
      'projects',
      'projects/read-attention-paper/project.yaml',
      PROJECT,
      'read-attention-paper',
    ],
    [
      'criteria',
      'assessments/self-attention/criteria.yaml',
      CRITERIA,
      'self-attention',
    ],
    ['blindspots', `blindspots/${BLINDSPOT_ID}.yaml`, BLINDSPOT, BLINDSPOT_ID],
    [
      'interventions',
      `interventions/${INTERVENTION_ID}.yaml`,
      INTERVENTION,
      INTERVENTION_ID,
    ],
  ] as const)(
    '%s: read and save back keep every byte',
    async (kind, path, text, id) => {
      const { fs, store } = await setup({ [path]: text });
      // 每个集合的值类型不同，这里只做读后再写，所以按 unknown 处理。
      const collection = store[kind] as unknown as {
        read(id: string): Promise<ReadResult<unknown> | null>;
        save(value: unknown, options: SaveOptions): Promise<WriteResult>;
        list(): Promise<unknown>;
      };
      const read = ok(await collection.read(id));
      const saved = await collection.save(read.value, { base: read.snapshot });
      expect(saved).toMatchObject({ ok: true, written: false });
      expect(await fs.readTextFile(path)).toBe(text);
      expect(await collection.list()).toEqual({ ids: [id], issues: [] });
    },
  );

  it('changes a value inside a flow mapping in place', async () => {
    const path = `blindspots/${BLINDSPOT_ID}.yaml`;
    const { fs, store } = await setup({ [path]: BLINDSPOT });
    const read = ok(await store.blindspots.read(BLINDSPOT_ID));
    const saved = await store.blindspots.save(
      {
        ...read.value,
        source: {
          ...read.value.source,
          model: 'ollama:qwen3-32b',
        } as typeof read.value.source,
      },
      { base: read.snapshot },
    );
    expect(saved).toMatchObject({ ok: true, written: true });
    expect(await fs.readTextFile(path)).toBe(
      BLINDSPOT.replace('ollama:qwen3-14b', 'ollama:qwen3-32b'),
    );
  });
});

describe('paths must match content (store.path_mismatch)', () => {
  it('reports a concept whose id differs from its file name', async () => {
    const { store } = await setup({ 'concepts/attention.md': CONCEPT });
    const read = await store.concepts.read('attention');
    expect(codes(read)).toEqual(['store.path_mismatch']);
    expect(read?.ok === false ? read.issues[0] : undefined).toMatchObject({
      file: 'concepts/attention.md',
      path: ['frontmatter', 'id'],
      params: { expected: 'attention', actual: 'self-attention' },
    });
  });

  it('reports evidence stored under another concept', async () => {
    const { store } = await setup({
      [`evidence/other/${evidenceExample.id}.json`]:
        JSON.stringify(evidenceExample),
    });
    expect(
      codes(await store.evidence.read('other', evidenceExample.id)),
    ).toEqual(['store.path_mismatch']);
  });

  it('refuses to save a value under another path than its base', async () => {
    const path = `blindspots/${BLINDSPOT_ID}.yaml`;
    const { fs, store } = await setup({ [path]: BLINDSPOT });
    const read = ok(await store.blindspots.read(BLINDSPOT_ID));
    const saved = await store.blindspots.save(
      {
        ...read.value,
        id: '01JD6B0A0A0A0A0A0A0A0A0A0B' as typeof read.value.id,
      },
      { base: read.snapshot },
    );
    expect(codes(saved)).toEqual(['store.path_mismatch']);
    expect(await fs.readTextFile(path)).toBe(BLINDSPOT);
  });
});

describe('listing', () => {
  it('lists ids sorted, ignores hidden files and reports unexpected names', async () => {
    const { store } = await setup({
      'concepts/b.md': 'x',
      'concepts/a.md': 'x',
      'concepts/.DS_Store': 'x',
      'concepts/notes.txt': 'x',
      'concepts/Bad Name.md': 'x',
    });
    const listed = await store.concepts.list();
    expect(listed.ids).toEqual(['a', 'b']);
    expect(listed.issues.map((i) => [i.code, i.file])).toEqual([
      ['store.unexpected_file', 'concepts/Bad Name.md'],
      ['store.unexpected_file', 'concepts/notes.txt'],
    ]);
  });

  it('lists nothing when the directory does not exist', async () => {
    const { store } = await setup();
    expect(await store.concepts.list()).toEqual({ ids: [], issues: [] });
    expect(await store.evidence.list('self-attention')).toEqual({
      ids: [],
      issues: [],
    });
  });

  it('reports a project directory without project.yaml', async () => {
    const { store } = await setup({ 'projects/empty/readme.md': 'x' });
    const listed = await store.projects.list();
    expect(listed.ids).toEqual([]);
    expect(listed.issues.map((i) => [i.code, i.file])).toEqual([
      ['store.missing_file', 'projects/empty/project.yaml'],
    ]);
  });
});

describe('concepts: frontmatter and body', () => {
  const CRLF = `\uFEFF${CONCEPT.replace(/\n/g, '\r\n')}`;

  it('reads the frontmatter and the body', async () => {
    const { store } = await setup({ 'concepts/self-attention.md': CONCEPT });
    const read = ok(await store.concepts.read('self-attention'));
    expect(read.value.frontmatter).toMatchObject({
      id: 'self-attention',
      tags: ['transformer'],
    });
    expect(read.value.body.startsWith('\n# Self-Attention\n')).toBe(true);
    expect(read.warnings).toEqual([]);
  });

  it('keeps every byte of a CRLF file with a BOM when nothing changed', async () => {
    const { fs, store } = await setup({ 'concepts/self-attention.md': CRLF });
    const read = ok(await store.concepts.read('self-attention'));
    expect(
      await store.concepts.save(read.value, { base: read.snapshot }),
    ).toMatchObject({ ok: true, written: false });
    expect(await fs.readTextFile('concepts/self-attention.md')).toBe(CRLF);
  });

  it('changes one frontmatter line and keeps the body, CRLF and the BOM', async () => {
    const { fs, store } = await setup({ 'concepts/self-attention.md': CRLF });
    const read = ok(await store.concepts.read('self-attention'));
    const frontmatter = { ...read.value.frontmatter, name: 'Self Attention' };
    await store.concepts.save(
      { ...read.value, frontmatter },
      { base: read.snapshot },
    );
    expect(await fs.readTextFile('concepts/self-attention.md')).toBe(
      CRLF.replace('name: Self-Attention', 'name: Self Attention'),
    );
  });

  it('replaces the body and keeps the frontmatter bytes', async () => {
    const { fs, store } = await setup({
      'concepts/self-attention.md': CONCEPT,
    });
    const read = ok(await store.concepts.read('self-attention'));
    await store.concepts.save(
      { ...read.value, body: '\n# New body\n' },
      { base: read.snapshot },
    );
    const end = CONCEPT.indexOf('---\n', 4) + 4;
    expect(await fs.readTextFile('concepts/self-attention.md')).toBe(
      `${CONCEPT.slice(0, end)}\n# New body\n`,
    );
  });

  it('keeps unknown fields (Obsidian) and warns about them', async () => {
    const text = CONCEPT.replace(
      'status: active\n',
      'status: active\ncssclass: wide\n',
    );
    const { fs, store } = await setup({ 'concepts/self-attention.md': text });
    const read = ok(await store.concepts.read('self-attention'));
    expect(read.warnings.map((w) => w.code)).toEqual(['concept.unknown_field']);
    const frontmatter = { ...read.value.frontmatter, name: 'Renamed' };
    await store.concepts.save(
      { ...read.value, frontmatter },
      { base: read.snapshot },
    );
    expect(await fs.readTextFile('concepts/self-attention.md')).toBe(
      text.replace('name: Self-Attention', 'name: Renamed'),
    );
  });

  it('includes warnings about the body sections', async () => {
    const text = CONCEPT.slice(0, CONCEPT.indexOf('# Self-Attention'));
    const { store } = await setup({ 'concepts/self-attention.md': text });
    const read = ok(await store.concepts.read('self-attention'));
    expect(read.warnings.length).toBeGreaterThan(0);
    expect(read.warnings[0]?.file).toBe('concepts/self-attention.md');
  });

  it('reports a file without frontmatter or with an unclosed one', async () => {
    const { store } = await setup({
      'concepts/a.md': '# A\n',
      'concepts/b.md': '---\nid: b\n',
    });
    expect(codes(await store.concepts.read('a'))).toEqual([
      'frontmatter.missing',
    ]);
    expect(codes(await store.concepts.read('b'))).toEqual([
      'frontmatter.unclosed',
    ]);
  });

  it('writes a new concept in the canonical form', async () => {
    const source = await setup({ 'concepts/self-attention.md': CONCEPT });
    const value = ok(await source.store.concepts.read('self-attention')).value;
    const { fs, store } = await setup();
    await store.concepts.save(value);
    expect(await fs.readTextFile('concepts/self-attention.md')).toBe(
      [
        '---',
        'schema_version: 1',
        'id: self-attention',
        'name: Self-Attention',
        'prerequisites: [matrix-multiplication, probability]',
        'status: active',
        'tags: [transformer]',
        '---',
        '',
      ].join('\n') + value.body,
    );
  });
});

describe('evidence and sessions: append only (invariant 2)', () => {
  it('appends evidence as canonical JSON', async () => {
    const { fs, store } = await setup();
    expect(
      await store.evidence.append(ok(await readEvidence()).value),
    ).toMatchObject({ ok: true, written: true });
    const text = await fs.readTextFile(EVIDENCE_PATH);
    expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
    expect(JSON.parse(text)).toEqual(evidenceExample);
    expect(
      ok(await store.evidence.read('self-attention', evidenceExample.id)).value,
    ).toEqual(evidenceExample);
    expect(await store.evidence.list('self-attention')).toEqual({
      ids: [evidenceExample.id],
      issues: [],
    });
  });

  it('refuses evidence with an id that already exists and keeps the original bytes', async () => {
    const { fs, store } = await setup();
    const value = ok(await readEvidence()).value;
    await store.evidence.append(value);
    const before = await fs.readTextFile(EVIDENCE_PATH);
    expect(
      codes(await store.evidence.append({ ...value, confidence: 0.1 })),
    ).toEqual(['store.already_exists']);
    expect(await fs.readTextFile(EVIDENCE_PATH)).toBe(before);
  });

  it('lets only one of two concurrent appends with the same id win', async () => {
    const { store } = await setup();
    const value = ok(await readEvidence()).value;
    const results = await Promise.all([
      store.evidence.append(value),
      store.evidence.append({ ...value, confidence: 0.1 }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it('offers no way to update or delete evidence or sessions', () => {
    const store = createStore(new MemoryFileSystem());
    expect(Object.keys(store.evidence).sort()).toEqual([
      'append',
      'list',
      'read',
    ]);
    expect(Object.keys(store.sessions).sort()).toEqual([
      'append',
      'list',
      'read',
    ]);
  });

  it('leaves no evidence behind when an append crashes half way (invariant 6)', async () => {
    const { fs, store } = await setup();
    const value = ok(await readEvidence()).value;
    fs.crashOnNextWrite();
    await expect(store.evidence.append(value)).rejects.toBeInstanceOf(
      SimulatedCrashError,
    );
    expect(await store.evidence.read('self-attention', value.id)).toBeNull();
    expect(await store.evidence.list('self-attention')).toEqual({
      ids: [],
      issues: [],
    });
    expect(await store.evidence.append(value)).toMatchObject({ ok: true });
  });

  it('refuses invalid evidence and writes nothing', async () => {
    const { fs, store } = await setup();
    const value = ok(await readEvidence()).value;
    const result = await store.evidence.append({ ...value, confidence: 2 });
    expect(codes(result)).not.toEqual([]);
    expect(await fs.list('')).toEqual([]);
  });

  it('appends sessions the same way', async () => {
    const source = await setup({
      [`assessments/self-attention/sessions/${sessionExample.id}.json`]:
        JSON.stringify(sessionExample),
    });
    const value = ok(
      await source.store.sessions.read('self-attention', sessionExample.id),
    ).value;
    const { store } = await setup();
    expect(await store.sessions.append(value)).toMatchObject({ ok: true });
    expect(codes(await store.sessions.append(value))).toEqual([
      'store.already_exists',
    ]);
  });

  async function readEvidence() {
    const { store } = await setup({
      [EVIDENCE_PATH]: JSON.stringify(evidenceExample),
    });
    return store.evidence.read('self-attention', evidenceExample.id);
  }
});

describe('mastery projection: derived, written by Mastery Core', () => {
  const PATH = 'mastery/self-attention.yaml';

  it('writes the canonical form, overwrites without a base, and skips identical writes', async () => {
    const source = await setup({ [PATH]: MASTERY });
    const value = ok(await source.store.mastery.read('self-attention')).value;
    const { fs, store } = await setup();
    expect(await store.mastery.write(value)).toMatchObject({
      ok: true,
      written: true,
    });
    const first = await fs.readTextFile(PATH);
    expect(await store.mastery.write(value)).toMatchObject({
      ok: true,
      written: false,
    });
    expect(
      await store.mastery.write({ ...value, confidence: 0.5 }),
    ).toMatchObject({ ok: true, written: true });
    expect(await fs.readTextFile(PATH)).toBe(
      first.replace('confidence: 0.82', 'confidence: 0.5'),
    );
  });
});

describe('mastery history: append only lines', () => {
  const PATH = 'mastery/history/self-attention.jsonl';
  const entry = historyExample as unknown as Parameters<
    Store['history']['append']
  >[1];

  it('creates the file, then appends one canonical line at a time', async () => {
    const { fs, store } = await setup();
    expect(await store.history.append('self-attention', entry)).toMatchObject({
      ok: true,
    });
    const first = await fs.readTextFile(PATH);
    expect(first).toBe(`${JSON.stringify(historyExample)}\n`);
    await store.history.append('self-attention', { ...entry, confidence: 0.5 });
    const second = await fs.readTextFile(PATH);
    expect(second.startsWith(first)).toBe(true);
    expect(second.split('\n')).toHaveLength(3);
    const read = ok(await store.history.read('self-attention'));
    expect(read.value.map((e) => e.confidence)).toEqual([0.82, 0.5]);
  });

  it('keeps the existing bytes and adds a missing final newline', async () => {
    const existing = JSON.stringify(
      { ...historyExample, confidence: 0.1 },
      null,
      0,
    );
    const { fs, store } = await setup({ [PATH]: existing });
    await store.history.append('self-attention', entry);
    expect(await fs.readTextFile(PATH)).toBe(
      `${existing}\n${JSON.stringify(historyExample)}\n`,
    );
  });

  it('reports a bad line with its index, and refuses to append to a file with problems', async () => {
    const good = JSON.stringify(historyExample);
    const text = `${good}\n{"schema_version": 1}\n`;
    const { fs, store } = await setup({ [PATH]: text });
    const read = await store.history.read('self-attention');
    expect(read?.ok === false ? read.issues[0]?.path[0] : undefined).toBe(1);
    expect(
      codes(await store.history.append('self-attention', entry)),
    ).not.toEqual([]);
    expect(await fs.readTextFile(PATH)).toBe(text);
  });
});

describe('files written by a newer version are read only', () => {
  it('reports migration.version_too_new and marks the file read only', async () => {
    const { store } = await setup({
      'workspace.yaml': 'schema_version: 99\nid: ai\nfuture_field: x\n',
    });
    const read = await store.workspace.read();
    expect(read).toMatchObject({ ok: false, readOnly: true });
    expect(codes(read)).toEqual(['migration.version_too_new']);
  });

  it('refuses to overwrite a newer projection (store.version_too_new)', async () => {
    const newer = MASTERY.replace('schema_version: 1', 'schema_version: 99');
    const path = 'mastery/self-attention.yaml';
    const source = await setup({ [path]: MASTERY });
    const value = ok(await source.store.mastery.read('self-attention')).value;
    const { fs, store } = await setup({ [path]: newer });
    expect(codes(await store.mastery.write(value))).toEqual([
      'store.version_too_new',
    ]);
    expect(await fs.readTextFile(path)).toBe(newer);
  });

  it('refuses to append to a history with a line from a newer version', async () => {
    const path = 'mastery/history/self-attention.jsonl';
    const text = `${JSON.stringify({ ...historyExample, schema_version: 99 })}\n`;
    const { fs, store } = await setup({ [path]: text });
    const entry = historyExample as unknown as Parameters<
      Store['history']['append']
    >[1];
    expect(codes(await store.history.append('self-attention', entry))).toEqual([
      'store.version_too_new',
    ]);
    expect(await fs.readTextFile(path)).toBe(text);
  });
});

describe('files in an older version', () => {
  // 现在所有文件都是 v1，还没有真正的迁移。测试里把 schema_version 0 当成“旧版本”：
  // 迁移时改成 1，其余不变。
  const options: StoreOptions = {
    validateFile: (kind: FileKind, data: unknown) => {
      if (
        typeof data === 'object' &&
        data !== null &&
        'schema_version' in data &&
        data.schema_version === 0
      ) {
        const result = validateFile(kind, { ...data, schema_version: 1 });
        return result.success ? { ...result, from: 0 } : result;
      }
      return validateFile(kind, data);
    },
  };
  const OLD = WORKSPACE.replace('schema_version: 1', 'schema_version: 0');

  it('are migrated in memory on read; the file is not touched', async () => {
    const { fs, store } = await setup({ 'workspace.yaml': OLD }, options);
    const read = ok(await store.workspace.read());
    expect(read.migratedFrom).toBe(0);
    expect(read.value.schema_version).toBe(1);
    expect(await fs.readTextFile('workspace.yaml')).toBe(OLD);
  });

  it('are written in the current version when saved', async () => {
    const { fs, store } = await setup({ 'workspace.yaml': OLD }, options);
    const read = ok(await store.workspace.read());
    expect(
      await store.workspace.save(read.value, { base: read.snapshot }),
    ).toMatchObject({ ok: true, written: true });
    const text = await fs.readTextFile('workspace.yaml');
    expect(text.startsWith('schema_version: 1\n')).toBe(true);
    expect(ok(await store.workspace.read()).migratedFrom).toBeNull();
  });
});
