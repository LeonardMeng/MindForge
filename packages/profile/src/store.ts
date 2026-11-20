import {
  IsoDateTime,
  Ulid,
  validateFile,
  type ProfileConfig,
} from '@mastery/schema';

import type { BackendSnapshot, ProfileBackend } from './backend.js';
import { deepEqual } from './equal.js';
import {
  fromSchemaIssue,
  profileError,
  type ProfileError,
  type ProfileIssue,
} from './errors.js';
import * as rules from './rules.js';
import {
  DOCUMENT_KINDS,
  PROFILE_DOCUMENTS,
  PROFILE_FIELDS,
  type ConceptLink,
  type ConflictChoice,
  type LoadedProfile,
  type Profile,
  type ProfileChange,
  type ProfileDocument,
  type ProfileInit,
  type ProfileResult,
  type RegisteredWorkspace,
  type Revision,
  type SyncResult,
  type SyncStatus,
  type Unwatch,
} from './types.js';

/** 单步操作（注册、注销、设置链接）遇到并发修改时最多尝试的次数。 */
export const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * 访问 Profile 的唯一入口（ADR-0004）。上层代码（Supervisor、runtime、UI）只用这个接口，
 * 不知道 Profile 存在哪里。用 {@link createProfileStore} 创建。
 *
 * - 领域规则不允许的操作返回 `{ ok: false, error }`，什么都不写；后端的 I/O 错误照常抛出。
 * - 乐观并发：`save` 要带上读取时的 `revision`；单步操作在并发修改时自动重试。
 */
export interface ProfileStore {
  /** 读取 Profile。还没有时返回 `profile.not_found`。 */
  load(): Promise<ProfileResult<LoadedProfile>>;
  /** 创建 Profile（id 由 store 生成）。已经存在时返回 `profile.already_exists`。 */
  create(init: ProfileInit): Promise<ProfileResult<LoadedProfile>>;
  /**
   * 保存整个 Profile。`base` 是读取时的 revision，之后被改过时返回 `profile.modified_since_load`。
   * 只写有变化的文档；没有变化时不写，返回原来的 revision。
   */
  save(
    profile: Profile,
    options: { readonly base: Revision },
  ): Promise<ProfileResult<Revision>>;
  listWorkspaces(): Promise<ProfileResult<RegisteredWorkspace[]>>;
  /** 注册一个 Workspace；id 已经注册时返回 `profile.workspace_already_registered`。 */
  registerWorkspace(
    entry: RegisteredWorkspace,
  ): Promise<ProfileResult<Revision>>;
  /** 注销一个 Workspace，同时删掉涉及它的概念链接，并返回删掉了哪些。 */
  unregisterWorkspace(id: string): Promise<
    ProfileResult<{
      readonly revision: Revision;
      readonly removedLinks: ConceptLink[];
    }>
  >;
  getConceptLinks(): Promise<ProfileResult<ConceptLink[]>>;
  /** 替换全部概念链接；两端的 Workspace 都要已注册。 */
  setConceptLinks(
    links: readonly ConceptLink[],
  ): Promise<ProfileResult<Revision>>;
  watch(listener: (change: ProfileChange) => void): Unwatch;
  syncStatus(): Promise<SyncStatus>;
  sync(): Promise<SyncResult>;
  /** 解决一个文档的同步冲突。 */
  resolveConflict(
    document: ProfileDocument,
    choice: ConflictChoice,
  ): Promise<ProfileResult<Revision>>;
}

/** {@link createProfileStore} 的选项。 */
export interface ProfileStoreOptions {
  /** 当前时间（`profile` 不能用 Platform 的 Clock）。返回值会被校验。 */
  readonly now: () => string;
  /** 生成 ULID（`profile` 不能用 Platform 的 IdGenerator）。返回值会被校验。 */
  readonly generateId: () => string;
  /** 单步操作遇到并发修改时最多尝试几次，默认 {@link DEFAULT_MAX_ATTEMPTS}。 */
  readonly maxAttempts?: number;
}

const fail = <T>(error: ProfileError): ProfileResult<T> => ({
  ok: false,
  error,
});

/**
 * 在一个后端上创建 {@link ProfileStore}。**所有领域规则都在这里执行**，后端只保存文档和同步。
 *
 * @param backend - 存储后端（`profile-store-git`、将来的 `profile-store-cloud`，或测试用的内存后端）
 * @param options - 时间、ID 生成和重试次数
 */
export function createProfileStore(
  backend: ProfileBackend,
  options: ProfileStoreOptions,
): ProfileStore {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error(
      `maxAttempts must be a positive integer, got ${String(maxAttempts)}`,
    );
  }

  /** 注入的函数返回了不合格的值：这是调用方的错，直接抛出，不能写出格式错误的数据。 */
  const now = (): IsoDateTime => {
    const value = options.now();
    const parsed = IsoDateTime.safeParse(value);
    if (!parsed.success)
      throw new Error(`now() returned "${value}", which is not an IsoDateTime`);
    return parsed.data;
  };
  const generateId = (): Ulid => {
    const value = options.generateId();
    const parsed = Ulid.safeParse(value);
    if (!parsed.success)
      throw new Error(`generateId() returned "${value}", which is not a ULID`);
    return parsed.data;
  };

  /** 校验后端读出的数据，组成 Profile。 */
  function toProfile(snapshot: BackendSnapshot): ProfileResult<LoadedProfile> {
    const issues: ProfileIssue[] = [];
    const data: Partial<Record<ProfileDocument, unknown>> = {};
    for (const document of PROFILE_DOCUMENTS) {
      const result = validateFile(
        DOCUMENT_KINDS[document],
        snapshot.documents[document],
      );
      if (result.success) {
        data[document] = result.data;
        continue;
      }
      if (
        result.issues.some(
          (issue) => issue.code === 'migration.version_too_new',
        )
      ) {
        return fail(profileError('profile.version_too_new', { document }));
      }
      issues.push(
        ...result.issues.map((issue) => fromSchemaIssue(document, issue)),
      );
    }
    if (issues.length > 0)
      return fail(profileError('profile.invalid', {}, issues));
    const profile = Object.fromEntries(
      PROFILE_DOCUMENTS.map((document) => [
        PROFILE_FIELDS[document],
        data[document],
      ]),
    ) as unknown as Profile;
    return {
      ok: true,
      value: {
        profile,
        revision: snapshot.revision,
        conflicts: snapshot.conflicts,
        issues: rules.crossDocumentIssues(profile),
      },
    };
  }

  async function load(): Promise<ProfileResult<LoadedProfile>> {
    const snapshot = await backend.read();
    if (snapshot === null) return fail(profileError('profile.not_found'));
    return toProfile(snapshot);
  }

  /** 校验要写的 Profile 的每个文档，返回校验后的数据。 */
  function validateAll(
    profile: Profile,
  ): ProfileResult<Record<ProfileDocument, unknown>> {
    const issues: ProfileIssue[] = [];
    const data = {} as Record<ProfileDocument, unknown>;
    for (const document of PROFILE_DOCUMENTS) {
      const result = validateFile(
        DOCUMENT_KINDS[document],
        profile[PROFILE_FIELDS[document]],
      );
      if (result.success) data[document] = result.data;
      else
        issues.push(
          ...result.issues.map((issue) => fromSchemaIssue(document, issue)),
        );
    }
    return issues.length > 0
      ? fail(profileError('profile.invalid', {}, issues))
      : { ok: true, value: data };
  }

  type Committed = ProfileResult<Revision> | { readonly ok: 'retry' };

  /** 检查规则后写入有变化的文档；并发修改时返回 `retry`。 */
  async function commit(
    loaded: LoadedProfile,
    next: Profile,
  ): Promise<Committed> {
    const validated = validateAll(next);
    if (!validated.ok) return validated;
    const before = loaded.profile.config;
    const after = validated.value.profile as ProfileConfig;
    if (after.id !== before.id) {
      return fail(
        profileError('profile.id_changed', { from: before.id, to: after.id }),
      );
    }
    const changed = PROFILE_DOCUMENTS.filter(
      (document) =>
        !deepEqual(
          loaded.profile[PROFILE_FIELDS[document]],
          validated.value[document],
        ),
    );
    if (changed.length === 0) return { ok: true, value: loaded.revision };
    const conflicted = changed.find((document) =>
      loaded.conflicts.includes(document),
    );
    if (conflicted !== undefined) {
      return fail(
        profileError('profile.conflict_unresolved', { document: conflicted }),
      );
    }
    const nextProfile = Object.fromEntries(
      PROFILE_DOCUMENTS.map((document) => [
        PROFILE_FIELDS[document],
        validated.value[document],
      ]),
    ) as unknown as Profile;
    const added = rules.newIssues(
      loaded.issues,
      rules.crossDocumentIssues(nextProfile),
    );
    const first = added[0];
    if (first !== undefined) {
      // 现在跨文档的规则只有一条：概念链接两端的 Workspace 要已注册。
      const { ref, workspace } = first.params as {
        ref: string;
        workspace: string;
      };
      return fail(
        profileError(
          'profile.link_workspace_not_registered',
          { ref, workspace },
          added,
        ),
      );
    }
    const documents = Object.fromEntries(
      changed.map((document) => [document, validated.value[document]]),
    );
    const written = await backend.write(documents, loaded.revision);
    if (written.ok) return { ok: true, value: written.revision };
    return { ok: 'retry' };
  }

  /**
   * 单步操作：每次尝试都重新读取最新的 Profile，在它上面重新执行操作并重新检查全部规则，
   * 绝不复用旧的副本。最多尝试 `maxAttempts` 次。
   */
  async function mutate<T>(
    operation: (
      profile: Profile,
    ) => ProfileResult<{ profile: Profile; extra: T }>,
  ): Promise<ProfileResult<{ revision: Revision; extra: T }>> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const loaded = await load();
      if (!loaded.ok) return loaded;
      const applied = operation(loaded.value.profile);
      if (!applied.ok) return applied;
      const committed = await commit(loaded.value, applied.value.profile);
      if (committed.ok === 'retry') continue;
      if (!committed.ok) return committed;
      return {
        ok: true,
        value: { revision: committed.value, extra: applied.value.extra },
      };
    }
    return fail(profileError('profile.modified_since_load'));
  }

  const withoutExtra = <T>(
    result: ProfileResult<{ revision: Revision; extra: T }>,
  ): ProfileResult<Revision> =>
    result.ok ? { ok: true, value: result.value.revision } : result;

  return {
    load,

    async create(init) {
      const profile: Profile = {
        config: {
          schema_version: 1,
          id: generateId(),
          ...init,
        },
        workspaces: { schema_version: 1, workspaces: [] },
        conceptLinks: { schema_version: 1, links: [] },
        defaults: { schema_version: 1, plugins: {}, model: null },
      };
      const validated = validateAll(profile);
      if (!validated.ok) return validated;
      const written = await backend.write(validated.value, null);
      if (!written.ok) return fail(profileError('profile.already_exists'));
      return load();
    },

    async save(profile, { base }) {
      const loaded = await load();
      if (!loaded.ok) return loaded;
      if (loaded.value.revision !== base)
        return fail(profileError('profile.modified_since_load'));
      const committed = await commit(loaded.value, profile);
      if (committed.ok === 'retry')
        return fail(profileError('profile.modified_since_load'));
      return committed;
    },

    async listWorkspaces() {
      const loaded = await load();
      return loaded.ok
        ? { ok: true, value: [...loaded.value.profile.workspaces.workspaces] }
        : loaded;
    },

    async registerWorkspace(entry) {
      return withoutExtra(
        await mutate((profile) => {
          const result = rules.registerWorkspace(profile, entry);
          return result.ok
            ? { ok: true, value: { profile: result.value, extra: null } }
            : result;
        }),
      );
    },

    async unregisterWorkspace(id) {
      const result = await mutate((profile) => {
        const applied = rules.unregisterWorkspace(profile, id);
        return applied.ok
          ? {
              ok: true,
              value: {
                profile: applied.value.profile,
                extra: applied.value.removedLinks,
              },
            }
          : applied;
      });
      return result.ok
        ? {
            ok: true,
            value: {
              revision: result.value.revision,
              removedLinks: result.value.extra,
            },
          }
        : result;
    },

    async getConceptLinks() {
      const loaded = await load();
      return loaded.ok
        ? { ok: true, value: [...loaded.value.profile.conceptLinks.links] }
        : loaded;
    },

    async setConceptLinks(links) {
      return withoutExtra(
        await mutate((profile) => ({
          ok: true,
          value: {
            profile: rules.setConceptLinks(profile, links),
            extra: null,
          },
        })),
      );
    },

    watch: (listener) => backend.watch(listener),
    syncStatus: () => backend.syncStatus(),
    // async：now() 返回不合格的值时，以 rejected promise 报告，而不是同步抛出。
    sync: async () => backend.sync(now()),

    async resolveConflict(document, choice) {
      const result = await backend.resolveConflict(document, choice);
      return result.ok
        ? { ok: true, value: result.revision }
        : fail(profileError('profile.no_conflict', { document }));
    },
  };
}
