/**
 * ProfileStore 的契约测试。所有实现（内存、Git、将来的云）都要通过同一套测试：
 *
 * ```ts
 * import { describeProfileStoreContract } from '@mastery/profile/contract';
 * describeProfileStoreContract('git', () => ({ store, editExternally }));
 * ```
 *
 * 依赖 vitest（可选的 peerDependency），只在测试里使用。
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { ProfileStore } from '../store.js';
import type {
  ConceptLink,
  ProfileChange,
  ProfileDocument,
  ProfileResult,
  RegisteredWorkspace,
} from '../types.js';

/** 契约测试的被测对象：一个还没有 Profile 的 store，加上测试需要的辅助能力。 */
export interface ProfileStoreContractSubject {
  readonly store: ProfileStore;
  /** 模拟别的程序直接修改了一个文档（不经过 store，不校验）。 */
  editExternally(
    document: ProfileDocument,
    data: unknown,
  ): void | Promise<void>;
}

/** 同步测试里的一台设备。 */
export interface SyncDevice {
  readonly store: ProfileStore;
  /** 模拟断网或恢复网络。 */
  setOnline(online: boolean): void | Promise<void>;
}

/** 契约测试的选项：实现支持哪些能力。 */
export interface ProfileStoreContractOptions {
  /** 支持同步时提供：创建共用同一个远程的两台设备（都还没有 Profile）。 */
  readonly sync?: () =>
    | { readonly a: SyncDevice; readonly b: SyncDevice }
    | Promise<{ readonly a: SyncDevice; readonly b: SyncDevice }>;
}

const INIT = {
  name: 'Parker',
  language: 'zh-CN',
  weekly_minutes: 300,
} as const;
const ws = (id: string, remote: string | null = null): RegisteredWorkspace =>
  ({ id, name: id.toUpperCase(), remote }) as RegisteredWorkspace;
const link = (from: string, to: string): ConceptLink =>
  ({ from, relation: 'requires', to }) as ConceptLink;

/** 要求成功，返回值。 */
function ok<T>(result: ProfileResult<T>): T {
  if (!result.ok)
    throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

/** 要求失败，返回错误码。 */
function code(result: ProfileResult<unknown>): string {
  if (result.ok) throw new Error('expected the operation to fail');
  return result.error.code;
}

/**
 * ProfileStore 的契约测试。
 *
 * @param name - 实现的名字，用在测试标题里
 * @param create - 每个测试调用一次，返回一个还没有 Profile 的 store
 * @param options - 可选能力（同步）
 */
export function describeProfileStoreContract(
  name: string,
  create: () =>
    ProfileStoreContractSubject | Promise<ProfileStoreContractSubject>,
  options: ProfileStoreContractOptions = {},
): void {
  describe(`ProfileStore contract: ${name}`, () => {
    let subject: ProfileStoreContractSubject;
    let store: ProfileStore;

    beforeEach(async () => {
      subject = await create();
      store = subject.store;
    });

    async function revision(): Promise<string> {
      return ok(await store.load()).revision;
    }

    describe('creating and loading', () => {
      it('reports profile.not_found for every operation before a profile exists', async () => {
        expect(code(await store.load())).toBe('profile.not_found');
        expect(code(await store.listWorkspaces())).toBe('profile.not_found');
        expect(code(await store.registerWorkspace(ws('ai')))).toBe(
          'profile.not_found',
        );
        expect(code(await store.unregisterWorkspace('ai'))).toBe(
          'profile.not_found',
        );
        expect(code(await store.getConceptLinks())).toBe('profile.not_found');
        expect(code(await store.setConceptLinks([]))).toBe('profile.not_found');
      });

      it('creates a profile with a generated ULID and empty documents', async () => {
        const created = ok(await store.create(INIT));
        expect(created.profile.config).toMatchObject({
          schema_version: 1,
          ...INIT,
        });
        expect(created.profile.config.id).toMatch(
          /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/,
        );
        expect(created.profile.workspaces.workspaces).toEqual([]);
        expect(created.profile.conceptLinks.links).toEqual([]);
        expect(created.profile.defaults).toEqual({
          schema_version: 1,
          plugins: {},
          model: null,
        });
        expect(created.conflicts).toEqual([]);
        expect(created.issues).toEqual([]);
        expect(ok(await store.load())).toEqual(created);
      });

      it('refuses to create a second profile', async () => {
        ok(await store.create(INIT));
        expect(code(await store.create({ ...INIT, name: 'Other' }))).toBe(
          'profile.already_exists',
        );
        expect(ok(await store.load()).profile.config.name).toBe('Parker');
      });

      it('refuses an invalid profile and creates nothing', async () => {
        const result = await store.create({ ...INIT, language: 'zh_CN' });
        expect(code(result)).toBe('profile.invalid');
        expect(
          result.ok ? [] : result.error.issues.map((i) => [i.document, i.code]),
        ).toEqual([['profile', 'profile.invalid_language']]);
        expect(code(await store.load())).toBe('profile.not_found');
      });
    });

    describe('workspaces', () => {
      beforeEach(async () => {
        ok(await store.create(INIT));
      });

      it('registers workspaces and lists them in order', async () => {
        ok(await store.registerWorkspace(ws('ai', 'git@github.com:me/ai.git')));
        ok(await store.registerWorkspace(ws('math')));
        expect(ok(await store.listWorkspaces()).map((w) => w.id)).toEqual([
          'ai',
          'math',
        ]);
      });

      it('refuses a workspace id that is already registered, writing nothing', async () => {
        ok(await store.registerWorkspace(ws('ai')));
        const before = await revision();
        expect(
          code(await store.registerWorkspace(ws('ai', 'git@x.org:a/b.git'))),
        ).toBe('profile.workspace_already_registered');
        expect(await revision()).toBe(before);
      });

      it('refuses a registration that breaks the schema, writing nothing', async () => {
        const before = await revision();
        const result = await store.registerWorkspace(
          ws('ai', '/Volumes/USB/ai.git'),
        );
        expect(code(result)).toBe('profile.invalid');
        expect(
          result.ok ? [] : result.error.issues.map((i) => [i.document, i.code]),
        ).toEqual([['workspaces', 'remote.local_path']]);
        expect(await revision()).toBe(before);
      });

      it('unregisters a workspace and removes every link that touches it', async () => {
        for (const id of ['ai', 'math', 'physics'])
          ok(await store.registerWorkspace(ws(id)));
        ok(
          await store.setConceptLinks([
            link('ai:self-attention', 'math:matrix-multiplication'),
            link('physics:mechanics', 'math:calculus'),
            link('ai:optimization', 'physics:mechanics'),
          ]),
        );
        const removed = ok(await store.unregisterWorkspace('math'));
        expect(removed.removedLinks).toEqual([
          link('ai:self-attention', 'math:matrix-multiplication'),
          link('physics:mechanics', 'math:calculus'),
        ]);
        expect(ok(await store.getConceptLinks())).toEqual([
          link('ai:optimization', 'physics:mechanics'),
        ]);
        expect(ok(await store.listWorkspaces()).map((w) => w.id)).toEqual([
          'ai',
          'physics',
        ]);
        expect(removed.revision).toBe(await revision());
      });

      it('refuses to unregister a workspace that is not registered', async () => {
        expect(code(await store.unregisterWorkspace('ai'))).toBe(
          'profile.workspace_not_registered',
        );
      });
    });

    describe('concept links', () => {
      beforeEach(async () => {
        ok(await store.create(INIT));
        ok(await store.registerWorkspace(ws('ai')));
        ok(await store.registerWorkspace(ws('math')));
      });

      it('sets links between registered workspaces', async () => {
        const links = [link('ai:self-attention', 'math:matrix-multiplication')];
        ok(await store.setConceptLinks(links));
        expect(ok(await store.getConceptLinks())).toEqual(links);
      });

      it('requires both ends to be in registered workspaces, writing nothing', async () => {
        const before = await revision();
        const result = await store.setConceptLinks([link('ai:a', 'physics:b')]);
        expect(code(result)).toBe('profile.link_workspace_not_registered');
        expect(result.ok ? [] : result.error.issues.map((i) => i.path)).toEqual(
          [['links', 0, 'to']],
        );
        expect(await revision()).toBe(before);
      });

      it('refuses links that break the schema', async () => {
        expect(code(await store.setConceptLinks([link('ai:a', 'ai:b')]))).toBe(
          'profile.invalid',
        );
      });
    });

    describe('saving with a revision', () => {
      beforeEach(async () => {
        ok(await store.create(INIT));
      });

      it('saves with the revision it loaded, and refuses a stale one', async () => {
        const loaded = ok(await store.load());
        const profile = {
          ...loaded.profile,
          defaults: { ...loaded.profile.defaults, model: 'ollama:qwen3-14b' },
        } as typeof loaded.profile;
        const saved = ok(await store.save(profile, { base: loaded.revision }));
        expect(saved).not.toBe(loaded.revision);
        expect(ok(await store.load()).profile.defaults.model).toBe(
          'ollama:qwen3-14b',
        );
        expect(
          code(await store.save(loaded.profile, { base: loaded.revision })),
        ).toBe('profile.modified_since_load');
        expect(ok(await store.load()).profile.defaults.model).toBe(
          'ollama:qwen3-14b',
        );
      });

      it('writes nothing and keeps the revision when nothing changed', async () => {
        const loaded = ok(await store.load());
        expect(
          ok(await store.save(loaded.profile, { base: loaded.revision })),
        ).toBe(loaded.revision);
        expect(await revision()).toBe(loaded.revision);
      });

      it('refuses to change the profile id', async () => {
        const loaded = ok(await store.load());
        const profile = {
          ...loaded.profile,
          config: {
            ...loaded.profile.config,
            id: '01JD4A0Y3S8M2K7Q5N1V6B9C0D',
          },
        } as typeof loaded.profile;
        expect(code(await store.save(profile, { base: loaded.revision }))).toBe(
          'profile.id_changed',
        );
      });

      it('refuses a save that breaks the schema', async () => {
        const loaded = ok(await store.load());
        const profile = {
          ...loaded.profile,
          defaults: {
            ...loaded.profile.defaults,
            plugins: { x: { api_key: 'k' } },
          },
        } as unknown as typeof loaded.profile;
        const result = await store.save(profile, { base: loaded.revision });
        expect(
          result.ok ? [] : result.error.issues.map((i) => [i.document, i.code]),
        ).toEqual([['defaults', 'secret.field_not_allowed']]);
      });
    });

    describe('external edits', () => {
      beforeEach(async () => {
        ok(await store.create(INIT));
        ok(await store.registerWorkspace(ws('ai')));
      });

      it('loads a profile whose cross-document rules are broken, reporting the issues', async () => {
        await subject.editExternally('concept-links', {
          schema_version: 1,
          links: [link('ai:a', 'math:b')],
        });
        const loaded = ok(await store.load());
        expect(loaded.issues.map((i) => [i.document, i.code, i.path])).toEqual([
          [
            'concept-links',
            'profile.link_workspace_not_registered',
            ['links', 0, 'to'],
          ],
        ]);
      });

      it('lets unrelated writes and fixes through, but never makes the problems worse', async () => {
        await subject.editExternally('concept-links', {
          schema_version: 1,
          links: [link('ai:a', 'math:b')],
        });
        // 不相关的写入照常。
        ok(await store.registerWorkspace(ws('cooking')));
        // 让问题变多的写入被拒绝。
        expect(
          code(
            await store.setConceptLinks([
              link('ai:a', 'math:b'),
              link('ai:c', 'physics:d'),
            ]),
          ),
        ).toBe('profile.link_workspace_not_registered');
        // 修复：注册缺少的 Workspace。
        ok(await store.registerWorkspace(ws('math')));
        expect(ok(await store.load()).issues).toEqual([]);
      });

      it('reports an invalid document as profile.invalid, naming the document', async () => {
        await subject.editExternally('workspaces', {
          schema_version: 1,
          workspaces: 'ai',
        });
        const result = await store.load();
        expect(code(result)).toBe('profile.invalid');
        expect(
          result.ok ? [] : result.error.issues.map((i) => i.document),
        ).toEqual(['workspaces']);
      });

      it('refuses every write while a document is from a newer version', async () => {
        await subject.editExternally('defaults', {
          schema_version: 99,
          plugins: {},
          model: null,
          future: true,
        });
        expect(code(await store.load())).toBe('profile.version_too_new');
        expect(code(await store.registerWorkspace(ws('math')))).toBe(
          'profile.version_too_new',
        );
      });
    });

    describe('watch', () => {
      it('notifies of local changes, and stops after unwatch (which can be called twice)', async () => {
        ok(await store.create(INIT));
        const changes: ProfileChange[] = [];
        const unwatch = store.watch((change) => changes.push(change));
        ok(await store.registerWorkspace(ws('ai')));
        expect(changes).toContainEqual({
          document: 'workspaces',
          source: 'local',
        });
        unwatch();
        unwatch();
        changes.length = 0;
        ok(await store.registerWorkspace(ws('math')));
        expect(changes).toEqual([]);
      });
    });

    it('reports profile.no_conflict when resolving a document without a conflict', async () => {
      ok(await store.create(INIT));
      expect(code(await store.resolveConflict('defaults', 'local'))).toBe(
        'profile.no_conflict',
      );
      expect((await store.syncStatus()).conflicts).toEqual([]);
    });

    describe.skipIf(options.sync === undefined)('sync', () => {
      let a: SyncDevice;
      let b: SyncDevice;

      beforeEach(async () => {
        if (options.sync === undefined) return;
        ({ a, b } = await options.sync());
        ok(await a.store.create(INIT));
        expect((await a.store.sync()).status).toBe('synced');
        expect((await b.store.sync()).status).toBe('synced');
      });

      async function setModel(store: ProfileStore, model: string) {
        const loaded = ok(await store.load());
        const profile = {
          ...loaded.profile,
          defaults: { ...loaded.profile.defaults, model },
        } as typeof loaded.profile;
        return store.save(profile, { base: loaded.revision });
      }

      it('a new device pulls the whole profile', async () => {
        expect(ok(await b.store.load()).profile).toEqual(
          ok(await a.store.load()).profile,
        );
        expect((await b.store.syncStatus()).lastSyncedAt).not.toBeNull();
      });

      it('writes offline, counts pending changes and pushes them when back online', async () => {
        await a.setOnline(false);
        ok(await a.store.registerWorkspace(ws('ai')));
        expect(await a.store.syncStatus()).toMatchObject({
          remote: 'configured',
          online: false,
          pendingChanges: 1,
        });
        expect((await a.store.sync()).status).toBe('offline');
        await a.setOnline(true);
        expect(await a.store.sync()).toMatchObject({
          status: 'synced',
          pushed: ['workspaces'],
        });
        expect((await a.store.syncStatus()).pendingChanges).toBe(0);

        const changes: ProfileChange[] = [];
        b.store.watch((change) => changes.push(change));
        expect(await b.store.sync()).toMatchObject({ pulled: ['workspaces'] });
        expect(changes).toContainEqual({
          document: 'workspaces',
          source: 'sync',
        });
        expect(ok(await b.store.listWorkspaces()).map((w) => w.id)).toEqual([
          'ai',
        ]);
      });

      it('turns edits of the same document on two devices into a conflict', async () => {
        ok(await setModel(a.store, 'ollama:model-a'));
        ok(await setModel(b.store, 'ollama:model-b'));
        await a.store.sync();
        expect(await b.store.sync()).toMatchObject({ conflicts: ['defaults'] });
        expect((await b.store.syncStatus()).conflicts).toEqual(['defaults']);
        // 读到本地版本。
        const loaded = ok(await b.store.load());
        expect(loaded.conflicts).toEqual(['defaults']);
        expect(loaded.profile.defaults.model).toBe('ollama:model-b');
      });

      it('refuses writes to a conflicted document, but not to other documents', async () => {
        ok(await setModel(a.store, 'ollama:model-a'));
        ok(await setModel(b.store, 'ollama:model-b'));
        await a.store.sync();
        await b.store.sync();
        const before = ok(await b.store.load()).revision;
        expect(code(await setModel(b.store, 'ollama:model-c'))).toBe(
          'profile.conflict_unresolved',
        );
        expect(ok(await b.store.load()).revision).toBe(before);
        ok(await b.store.registerWorkspace(ws('ai')));
      });

      it('resolves a conflict with the remote version', async () => {
        ok(await setModel(a.store, 'ollama:model-a'));
        ok(await setModel(b.store, 'ollama:model-b'));
        await a.store.sync();
        await b.store.sync();
        ok(await b.store.resolveConflict('defaults', 'remote'));
        expect(ok(await b.store.load()).profile.defaults.model).toBe(
          'ollama:model-a',
        );
        expect((await b.store.syncStatus()).conflicts).toEqual([]);
        ok(await setModel(b.store, 'ollama:model-c'));
      });

      it('resolves a conflict with the local version, which the next sync pushes', async () => {
        ok(await setModel(a.store, 'ollama:model-a'));
        ok(await setModel(b.store, 'ollama:model-b'));
        await a.store.sync();
        await b.store.sync();
        ok(await b.store.resolveConflict('defaults', 'local'));
        expect(await b.store.sync()).toMatchObject({
          pushed: ['defaults'],
          conflicts: [],
        });
        await a.store.sync();
        expect(ok(await a.store.load()).profile.defaults.model).toBe(
          'ollama:model-b',
        );
      });

      it('current behaviour (8.1 will merge): two offline devices registering different workspaces conflict on workspaces.yaml', async () => {
        await a.setOnline(false);
        await b.setOnline(false);
        ok(await a.store.registerWorkspace(ws('ai')));
        ok(await b.store.registerWorkspace(ws('math')));
        await a.setOnline(true);
        await b.setOnline(true);
        await a.store.sync();
        // 两边都改了 workspaces.yaml：现在按整个文档冲突，由用户选一边。
        expect(await b.store.sync()).toMatchObject({
          conflicts: ['workspaces'],
        });
        ok(await b.store.resolveConflict('workspaces', 'remote'));
        expect(ok(await b.store.listWorkspaces()).map((w) => w.id)).toEqual([
          'ai',
        ]);
        // 选了远程版本，本地的注册要重新做一次。
        ok(await b.store.registerWorkspace(ws('math')));
        await b.store.sync();
        await a.store.sync();
        expect(ok(await a.store.listWorkspaces()).map((w) => w.id)).toEqual([
          'ai',
          'math',
        ]);
      });
    });
  });
}
