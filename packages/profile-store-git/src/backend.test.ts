import type { FileSystem } from '@mastery/platform';
import {
  MemoryFileSystem,
  MemoryLockSpace,
  SimulatedCrashError,
} from '@mastery/platform-memory';
import type {
  ConceptLink,
  ProfileChange,
  ProfileResult,
  ProfileStore,
  RegisteredWorkspace,
} from '@mastery/profile';
import { describeProfileStoreContract } from '@mastery/profile/contract';
import { stringifyYaml } from '@mastery/store';
import { describe, expect, it, vi } from 'vitest';

import {
  createGitProfileStore,
  PROFILE_FILES,
  PROFILE_WRITE_LOCK,
  profileRevision,
} from './index.js';

function idGenerator(): () => string {
  let counter = 0;
  return () => `01JD4A0Y3S${String(++counter).padStart(16, '0')}`;
}
const NOW = () => '2026-11-20T08:00:00Z';
const INIT = {
  name: 'Parker',
  language: 'zh-CN',
  weekly_minutes: 300,
} as const;
const ws = (id: string) =>
  ({ id, name: id, remote: null }) as RegisteredWorkspace;
const link = (from: string, to: string) =>
  ({ from, relation: 'requires', to }) as ConceptLink;

function ok<T>(result: ProfileResult<T>): T {
  if (!result.ok)
    throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

function setup(
  fs: FileSystem = new MemoryFileSystem(),
  locks = new MemoryLockSpace(),
) {
  return {
    fs,
    locks,
    store: createGitProfileStore({
      fs,
      lock: locks.lock(),
      now: NOW,
      generateId: idGenerator(),
    }),
  };
}

describeProfileStoreContract('git (files only)', () => {
  const { fs, store } = setup();
  return {
    store,
    editExternally: (document, data) =>
      fs.writeTextFile(PROFILE_FILES[document], stringifyYaml(data)),
  };
});

describe('files', () => {
  it('creates the four YAML files in the canonical form', async () => {
    const { fs, store } = setup();
    const created = ok(await store.create(INIT));
    expect((await fs.list('')).map((entry) => entry.name)).toEqual([
      'concept-links.yaml',
      'defaults.yaml',
      'profile.yaml',
      'workspaces.yaml',
    ]);
    expect(await fs.readTextFile('profile.yaml')).toBe(
      [
        'schema_version: 1',
        `id: ${created.profile.config.id}`,
        'name: Parker',
        'language: zh-CN',
        'weekly_minutes: 300',
        '',
      ].join('\n'),
    );
    expect(await fs.readTextFile('workspaces.yaml')).toBe(
      'schema_version: 1\nworkspaces: []\n',
    );
  });

  it('keeps comments and the rest of the file when a field changes', async () => {
    const { fs, store } = setup();
    ok(await store.create(INIT));
    const original =
      `# 我的 Profile\n${await fs.readTextFile('profile.yaml')}`.replace(
        'weekly_minutes: 300',
        'weekly_minutes: 300   # 每周 5 小时',
      );
    await fs.writeTextFile('profile.yaml', original);
    const loaded = ok(await store.load());
    ok(
      await store.save(
        {
          ...loaded.profile,
          config: { ...loaded.profile.config, name: 'Parker Z' },
        },
        { base: loaded.revision },
      ),
    );
    expect(await fs.readTextFile('profile.yaml')).toBe(
      original.replace('name: Parker', 'name: Parker Z'),
    );
  });

  it('reports YAML that cannot be parsed, naming the document', async () => {
    const { fs, store } = setup();
    ok(await store.create(INIT));
    await fs.writeTextFile(
      'workspaces.yaml',
      'schema_version: 1\nworkspaces: []\nworkspaces: []\n',
    );
    const result = await store.load();
    expect(
      result.ok ? [] : result.error.issues.map((i) => [i.document, i.code]),
    ).toEqual([['workspaces', 'yaml.duplicate_key']]);
  });

  it('reports a missing document', async () => {
    const { fs, store } = setup();
    ok(await store.create(INIT));
    await fs.remove('defaults.yaml');
    const result = await store.load();
    expect(
      result.ok ? [] : result.error.issues.map((i) => [i.document, i.code]),
    ).toEqual([['defaults', 'profile.document_missing']]);
  });

  it('never overwrites a document written by a newer version', async () => {
    const { fs, store } = setup();
    ok(await store.create(INIT));
    const newer = 'schema_version: 2\nworkspaces: []\nfuture: true\n';
    await fs.writeTextFile('workspaces.yaml', newer);
    const result = await store.registerWorkspace(ws('ai'));
    expect(result.ok ? '' : result.error.code).toBe('profile.version_too_new');
    expect(await fs.readTextFile('workspaces.yaml')).toBe(newer);
  });

  it('ignores files that are not profile documents (learner-model/, skills/, .gitignore)', async () => {
    const { fs, store } = setup();
    ok(await store.create(INIT));
    await fs.writeTextFile('.gitignore', '.mastery/\n.mastery-tmp-*\n');
    await fs.mkdir('skills');
    await fs.writeTextFile('skills/x.md', 'x');
    expect(ok(await store.load()).issues).toEqual([]);
  });
});

describe('revision', () => {
  it('hashes each file separately, so different splits give different revisions', async () => {
    const a = await profileRevision([
      ['profile', 'ab'],
      ['workspaces', 'c'],
    ]);
    const b = await profileRevision([
      ['profile', 'a'],
      ['workspaces', 'bc'],
    ]);
    expect(a).not.toBe(b);
  });

  it('distinguishes a missing file from any content, and depends on the document names', async () => {
    const missing = await profileRevision([['defaults', null]]);
    expect(missing).not.toBe(
      await profileRevision([['defaults', 'missing-hash']]),
    );
    expect(await profileRevision([['defaults', 'h']])).not.toBe(
      await profileRevision([['profile', 'h']]),
    );
  });

  it('changes when any file changes, and stays the same otherwise', async () => {
    const { fs, store } = setup();
    ok(await store.create(INIT));
    const first = ok(await store.load()).revision;
    expect(ok(await store.load()).revision).toBe(first);
    await fs.writeTextFile(
      'defaults.yaml',
      'schema_version: 1\nplugins: {}\nmodel: null # x\n',
    );
    expect(ok(await store.load()).revision).not.toBe(first);
  });
});

/**
 * 包一层文件系统：在第 `after` 次写入时模拟崩溃（目标文件不变，只留下临时文件），
 * 也就是只完成前 `after` 次写入。
 */
function crashingAfter(after: number) {
  const fs = new MemoryFileSystem();
  let writes = 0;
  let armed = false;
  const wrapped: FileSystem = new Proxy(fs, {
    get(target, property, receiver) {
      if (property === 'writeTextFile') {
        return async (path: string, text: string) => {
          if (armed) {
            if (writes === after) fs.crashOnNextWrite();
            writes += 1;
          }
          return target.writeTextFile(path, text);
        };
      }
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
  return {
    fs: wrapped,
    arm: () => {
      armed = true;
    },
    writes: () => writes,
  };
}

describe('writing several files: every prefix is a valid profile', () => {
  /** 三个场景：准备好 Profile，然后做一次要写多个文件的修改。 */
  const SCENARIOS: readonly {
    readonly name: string;
    readonly prepare: (store: ProfileStore) => Promise<void>;
    readonly change: (store: ProfileStore) => Promise<unknown>;
  }[] = [
    {
      name: 'unregistering a workspace that links point to',
      prepare: async (store) => {
        ok(await store.registerWorkspace(ws('ai')));
        ok(await store.registerWorkspace(ws('math')));
        ok(
          await store.setConceptLinks([
            link('ai:self-attention', 'math:matrix-multiplication'),
          ]),
        );
      },
      change: (store) => store.unregisterWorkspace('math'),
    },
    {
      name: 'registering a workspace and linking to it in one save',
      prepare: async (store) => {
        ok(await store.registerWorkspace(ws('ai')));
      },
      change: async (store) => {
        const loaded = ok(await store.load());
        return store.save(
          {
            ...loaded.profile,
            workspaces: {
              ...loaded.profile.workspaces,
              workspaces: [ws('ai'), ws('math')],
            },
            conceptLinks: {
              ...loaded.profile.conceptLinks,
              links: [link('ai:a', 'math:b')],
            },
          },
          { base: loaded.revision },
        );
      },
    },
    {
      name: 'a save that changes all four documents',
      prepare: async (store) => {
        ok(await store.registerWorkspace(ws('ai')));
      },
      change: async (store) => {
        const loaded = ok(await store.load());
        return store.save(
          {
            config: { ...loaded.profile.config, name: 'Parker Z' },
            workspaces: {
              ...loaded.profile.workspaces,
              workspaces: [ws('ai'), ws('math')],
            },
            conceptLinks: {
              ...loaded.profile.conceptLinks,
              links: [link('ai:a', 'math:b')],
            },
            defaults: { ...loaded.profile.defaults, model: 'ollama:qwen3-14b' },
          },
          { base: loaded.revision },
        );
      },
    },
  ];

  for (const scenario of SCENARIOS) {
    describe(scenario.name, () => {
      async function run(crashAfter: number) {
        const harness = crashingAfter(crashAfter);
        const { store } = setup(harness.fs);
        ok(await store.create(INIT));
        await scenario.prepare(store);
        harness.arm();
        let crashed = false;
        try {
          const result = await scenario.change(store);
          expect((result as ProfileResult<unknown>).ok).toBe(true);
        } catch (error) {
          expect(error).toBeInstanceOf(SimulatedCrashError);
          crashed = true;
        }
        return { store, crashed, writes: harness.writes() };
      }

      it('writes more than one file', async () => {
        const { crashed, writes } = await run(Infinity);
        expect(crashed).toBe(false);
        expect(writes).toBeGreaterThan(1);
      });

      it('leaves a valid profile after a crash at any point of the sequence', async () => {
        const { writes: total } = await run(Infinity);
        for (let after = 0; after < total; after++) {
          const { store, crashed } = await run(after);
          expect(crashed, `crash after ${String(after)} writes`).toBe(true);
          const loaded = ok(await store.load());
          expect(loaded.issues, `crash after ${String(after)} writes`).toEqual(
            [],
          );
          // 写锁已经释放，可以继续写。
          ok(await store.registerWorkspace(ws(`after-${String(after)}`)));
        }
      });
    });
  }

  it('can create the profile again after a crash while creating it', async () => {
    for (let after = 0; after < 4; after++) {
      const harness = crashingAfter(after);
      const { store } = setup(harness.fs);
      harness.arm();
      await expect(store.create(INIT)).rejects.toBeInstanceOf(
        SimulatedCrashError,
      );
      // profile.yaml 最后写：它还不存在，所以 Profile 还不存在。
      const loaded = await store.load();
      expect(loaded.ok ? '' : loaded.error.code).toBe('profile.not_found');
      ok(await store.create(INIT));
    }
  });
});

describe('write lock', () => {
  it('lets two processes register different workspaces at the same time without losing either', async () => {
    const fs = new MemoryFileSystem();
    const locks = new MemoryLockSpace();
    const first = setup(fs, locks).store;
    const second = setup(fs, locks).store;
    ok(await first.create(INIT));
    const results = await Promise.all([
      first.registerWorkspace(ws('ai')),
      second.registerWorkspace(ws('math')),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(
      ok(await first.listWorkspaces())
        .map((w) => w.id)
        .sort(),
    ).toEqual(['ai', 'math']);
  });

  it('waits for the lock, and gives up with platform.lock_timeout', async () => {
    const fs = new MemoryFileSystem();
    const locks = new MemoryLockSpace();
    ok(await setup(fs, locks).store.create(INIT));
    const held = await locks.lock().acquire(PROFILE_WRITE_LOCK);
    const store = createGitProfileStore({
      fs,
      lock: locks.lock(),
      lockTimeoutMs: 50,
      now: NOW,
      generateId: idGenerator(),
    });
    await expect(store.registerWorkspace(ws('ai'))).rejects.toMatchObject({
      code: 'platform.lock_timeout',
    });
    await held.release();
    ok(await store.registerWorkspace(ws('ai')));
  });
});

describe('watch', () => {
  it('reports its own writes as local only, and edits by other programs as external', async () => {
    const { fs, store } = setup();
    ok(await store.create(INIT));
    const changes: ProfileChange[] = [];
    const unwatch = store.watch((change) => changes.push(change));
    ok(await store.registerWorkspace(ws('ai')));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(changes).toEqual([{ document: 'workspaces', source: 'local' }]);

    changes.length = 0;
    await fs.writeTextFile(
      'defaults.yaml',
      'schema_version: 1\nplugins: {}\nmodel: null\n# edited\n',
    );
    await vi.waitFor(() => {
      expect(changes).toContainEqual({
        document: 'defaults',
        source: 'external',
      });
    });
    unwatch();
  });
});
