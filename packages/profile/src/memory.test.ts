import { describe, expect, it } from 'vitest';

import { describeProfileStoreContract } from './contract/index.js';
import {
  createMemoryProfileStore,
  createProfileStore,
  DEFAULT_MAX_ATTEMPTS,
  MemoryProfileBackend,
  MemoryProfileRemote,
  crossDocumentIssues,
  type ConceptLink,
  type LoadedProfile,
  type Profile,
  type ProfileBackend,
  type ProfileDocument,
  type ProfileResult,
  type RegisteredWorkspace,
} from './index.js';

/** 确定性的 ULID：时间部分固定，随机部分换成递增的计数器。 */
function idGenerator(): () => string {
  let counter = 0;
  return () => `01JD4A0Y3S${String(++counter).padStart(16, '0')}`;
}

const NOW = () => '2026-11-20T08:00:00Z';
const options = () => ({ now: NOW, generateId: idGenerator() });
const INIT = {
  name: 'Parker',
  language: 'zh-CN',
  weekly_minutes: null,
} as const;
const ws = (id: string) =>
  ({ id, name: id, remote: null }) as RegisteredWorkspace;

function ok<T>(result: ProfileResult<T>): T {
  if (!result.ok)
    throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

describeProfileStoreContract(
  'memory',
  () => {
    const { store, backend } = createMemoryProfileStore(options());
    return {
      store,
      editExternally: (document, data) =>
        backend.editExternally(document, data),
    };
  },
  {
    sync: () => {
      const remote = new MemoryProfileRemote();
      const device = () => {
        const { store, backend } = createMemoryProfileStore({
          ...options(),
          remote,
        });
        return {
          store,
          setOnline: (online: boolean) => backend.setOnline(online),
        };
      };
      return { a: device(), b: device() };
    },
  },
);

/**
 * 在 store 每次写入之前，先让“另一个进程”通过同一个后端写入一次（最多 `times` 次），
 * 模拟并发修改。返回的后端记录 store 尝试写入的次数。
 */
function interfering(
  inner: MemoryProfileBackend,
  times: number,
  meanwhile: (
    other: ReturnType<typeof createProfileStore>,
    round: number,
  ) => Promise<unknown>,
): ProfileBackend & { readonly attempts: number } {
  const other = createProfileStore(inner, options());
  let attempts = 0;
  return {
    get attempts() {
      return attempts;
    },
    read: () => inner.read(),
    async write(documents, base) {
      attempts += 1;
      if (base !== null && attempts <= times) await meanwhile(other, attempts);
      return inner.write(documents, base);
    },
    watch: (listener) => inner.watch(listener),
    syncStatus: () => inner.syncStatus(),
    sync: (at) => inner.sync(at),
    resolveConflict: (document, choice) =>
      inner.resolveConflict(document, choice),
  };
}

describe('createProfileStore: optimistic concurrency', () => {
  async function setup(
    times: number,
    meanwhile: Parameters<typeof interfering>[2],
    maxAttempts?: number,
  ) {
    const inner = new MemoryProfileBackend();
    ok(await createProfileStore(inner, options()).create(INIT));
    const backend = interfering(inner, times, meanwhile);
    const store = createProfileStore(backend, {
      ...options(),
      ...(maxAttempts === undefined ? {} : { maxAttempts }),
    });
    return { inner, backend, store };
  }

  it('retries on the freshly loaded profile, keeping the other writer’s change', async () => {
    const { backend, store } = await setup(1, (other) =>
      other.registerWorkspace(ws('other')),
    );
    ok(await store.registerWorkspace(ws('ai')));
    expect(backend.attempts).toBe(2);
    expect(ok(await store.listWorkspaces()).map((w) => w.id)).toEqual([
      'other',
      'ai',
    ]);
  });

  it('re-runs the rules on every retry instead of reusing the stale copy', async () => {
    const { store } = await setup(1, (other) =>
      other.registerWorkspace(ws('ai')),
    );
    const result = await store.registerWorkspace(ws('ai'));
    expect(result.ok ? '' : result.error.code).toBe(
      'profile.workspace_already_registered',
    );
    expect(ok(await store.listWorkspaces()).map((w) => w.id)).toEqual(['ai']);
  });

  it(`gives up with profile.modified_since_load after ${String(DEFAULT_MAX_ATTEMPTS)} attempts by default`, async () => {
    const { backend, store } = await setup(Infinity, (other, round) =>
      other.registerWorkspace(ws(`other-${String(round)}`)),
    );
    const result = await store.registerWorkspace(ws('ai'));
    expect(result.ok ? '' : result.error.code).toBe(
      'profile.modified_since_load',
    );
    expect(backend.attempts).toBe(DEFAULT_MAX_ATTEMPTS);
    expect(ok(await store.listWorkspaces()).map((w) => w.id)).not.toContain(
      'ai',
    );
  });

  it('uses the configured number of attempts', async () => {
    const { backend, store } = await setup(
      Infinity,
      (other, round) => other.registerWorkspace(ws(`other-${String(round)}`)),
      5,
    );
    await store.registerWorkspace(ws('ai'));
    expect(backend.attempts).toBe(5);
  });

  it('does not retry save(): a stale base is the caller’s to handle', async () => {
    const { backend, store } = await setup(1, (other) =>
      other.registerWorkspace(ws('other')),
    );
    const loaded = ok(await store.load());
    const profile = {
      ...loaded.profile,
      defaults: { ...loaded.profile.defaults, model: 'ollama:m' },
    } as typeof loaded.profile;
    const result = await store.save(profile, { base: loaded.revision });
    expect(result.ok ? '' : result.error.code).toBe(
      'profile.modified_since_load',
    );
    expect(backend.attempts).toBe(1);
  });
});

describe('createProfileStore: injected now() and generateId()', () => {
  it('throws instead of writing a malformed id', async () => {
    const store = createProfileStore(new MemoryProfileBackend(), {
      now: NOW,
      generateId: () => 'not-a-ulid',
    });
    await expect(store.create(INIT)).rejects.toThrow('generateId()');
  });

  it('throws instead of recording a malformed time', async () => {
    const remote = new MemoryProfileRemote();
    const backend = new MemoryProfileBackend({ remote });
    const store = createProfileStore(backend, {
      now: () => '2026-11-20 08:00',
      generateId: idGenerator(),
    });
    ok(await store.create(INIT));
    await expect(store.sync()).rejects.toThrow('now()');
    expect((await store.syncStatus()).lastSyncedAt).toBeNull();
  });

  it('rejects a maxAttempts that is not a positive integer', () => {
    expect(() =>
      createProfileStore(new MemoryProfileBackend(), {
        ...options(),
        maxAttempts: 0,
      }),
    ).toThrow('maxAttempts');
  });
});

describe('MemoryProfileBackend', () => {
  it('has no remote unless one is given', async () => {
    const { store } = createMemoryProfileStore(options());
    ok(await store.create(INIT));
    expect(await store.sync()).toEqual({
      status: 'no_remote',
      pulled: [],
      pushed: [],
      conflicts: [],
    });
    expect(await store.syncStatus()).toMatchObject({
      remote: 'none',
      online: true,
    });
  });

  it('returns copies: changing a loaded profile does not change the stored one', async () => {
    const { store } = createMemoryProfileStore(options());
    const created = ok(await store.create(INIT));
    created.profile.workspaces.workspaces.push(ws('sneaky'));
    expect(ok(await store.listWorkspaces())).toEqual([]);
  });
});

describe('createProfileStore: write order', () => {
  const link = (from: string, to: string) =>
    ({ from, relation: 'requires', to }) as ConceptLink;

  async function setup() {
    const { store, backend } = createMemoryProfileStore(options());
    ok(await store.create(INIT));
    ok(await store.registerWorkspace(ws('ai')));
    ok(await store.registerWorkspace(ws('math')));
    return { store, backend };
  }

  /** 按给出的顺序逐个应用写入，检查每一步之后都没有跨文档的问题。 */
  function everyPrefixIsValid(
    before: LoadedProfile,
    order: readonly ProfileDocument[],
    after: LoadedProfile,
  ) {
    const fields = {
      profile: 'config',
      workspaces: 'workspaces',
      'concept-links': 'conceptLinks',
      defaults: 'defaults',
    } as const;
    let state: Record<string, unknown> = { ...before.profile };
    for (const document of order) {
      state = { ...state, [fields[document]]: after.profile[fields[document]] };
      expect(
        crossDocumentIssues(state as unknown as Profile),
        `after writing ${document}`,
      ).toEqual([]);
    }
  }

  it('writes the profile document last when creating, so a half-created profile does not exist', async () => {
    const { backend } = createMemoryProfileStore(options());
    const { store } = { store: createProfileStore(backend, options()) };
    ok(await store.create(INIT));
    expect(backend.writeLog).toEqual([
      ['workspaces', 'concept-links', 'defaults', 'profile'],
    ]);
  });

  it('removes links before the workspace when unregistering', async () => {
    const { store, backend } = await setup();
    ok(await store.setConceptLinks([link('ai:a', 'math:b')]));
    const before = ok(await store.load());
    ok(await store.unregisterWorkspace('math'));
    const order = backend.writeLog.at(-1) ?? [];
    expect(order).toEqual(['concept-links', 'workspaces']);
    everyPrefixIsValid(before, order, ok(await store.load()));
  });

  it('registers the workspace before the links that use it', async () => {
    const { store, backend } = await setup();
    const before = ok(await store.load());
    ok(
      await store.save(
        {
          ...before.profile,
          workspaces: {
            ...before.profile.workspaces,
            workspaces: [
              ...before.profile.workspaces.workspaces,
              ws('physics'),
            ],
          },
          conceptLinks: {
            ...before.profile.conceptLinks,
            links: [link('ai:a', 'physics:b')],
          },
        },
        { base: before.revision },
      ),
    );
    const order = backend.writeLog.at(-1) ?? [];
    expect(order.indexOf('workspaces')).toBeLessThan(
      order.indexOf('concept-links'),
    );
    everyPrefixIsValid(before, order, ok(await store.load()));
  });

  it('finds a safe order for a save that changes all four documents', async () => {
    const { store, backend } = await setup();
    ok(await store.setConceptLinks([link('ai:a', 'math:b')]));
    const before = ok(await store.load());
    ok(
      await store.save(
        {
          config: { ...before.profile.config, name: 'Parker Z' },
          workspaces: {
            ...before.profile.workspaces,
            workspaces: [ws('ai'), ws('math'), ws('physics')],
          },
          conceptLinks: {
            ...before.profile.conceptLinks,
            links: [link('ai:a', 'math:b'), link('ai:c', 'physics:d')],
          },
          defaults: { ...before.profile.defaults, model: 'ollama:qwen3-14b' },
        },
        { base: before.revision },
      ),
    );
    const order = backend.writeLog.at(-1) ?? [];
    expect([...order].sort()).toEqual([
      'concept-links',
      'defaults',
      'profile',
      'workspaces',
    ]);
    everyPrefixIsValid(before, order, ok(await store.load()));
  });

  it('refuses a change that has no safe order, writing nothing', async () => {
    const { store, backend } = await setup();
    ok(await store.setConceptLinks([link('ai:a', 'math:b')]));
    const before = ok(await store.load());
    const writes = backend.writeLog.length;
    // 把 math 换成 physics，同时把链接从 math 改到 physics：先写哪个文件，中间状态都有一条链接指向未注册的 Workspace。
    const result = await store.save(
      {
        ...before.profile,
        workspaces: {
          ...before.profile.workspaces,
          workspaces: [ws('ai'), ws('physics')],
        },
        conceptLinks: {
          ...before.profile.conceptLinks,
          links: [link('ai:a', 'physics:b')],
        },
      },
      { base: before.revision },
    );
    expect(result.ok ? '' : result.error.code).toBe(
      'profile.no_safe_write_order',
    );
    expect(backend.writeLog).toHaveLength(writes);
    expect(ok(await store.load()).revision).toBe(before.revision);
    // 分两步就可以：先注册 physics 并改链接，再注销 math。
    ok(await store.registerWorkspace(ws('physics')));
    ok(await store.setConceptLinks([link('ai:a', 'physics:b')]));
    ok(await store.unregisterWorkspace('math'));
  });
});
