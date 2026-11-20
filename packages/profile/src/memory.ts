import type { IsoDateTime } from '@mastery/schema';

import type {
  BackendSnapshot,
  BackendWriteResult,
  ProfileBackend,
} from './backend.js';
import { cloneJson, deepEqual } from './equal.js';
import {
  createProfileStore,
  type ProfileStore,
  type ProfileStoreOptions,
} from './store.js';
import {
  PROFILE_DOCUMENTS,
  type ConflictChoice,
  type ProfileChange,
  type ProfileDocument,
  type Revision,
  type SyncResult,
  type SyncStatus,
  type Unwatch,
} from './types.js';

/** 远程上的一个文档：内容和版本号（每次推送加 1）。 */
interface RemoteDocument {
  readonly data: unknown;
  readonly version: number;
}

/**
 * 内存里的“远程”（相当于 Git 远程或云服务）。多个 {@link MemoryProfileBackend} 共用一个，
 * 就像多台设备同步同一个 Profile。
 */
export class MemoryProfileRemote {
  /** @internal */
  readonly documents = new Map<ProfileDocument, RemoteDocument>();
}

/** {@link MemoryProfileBackend} 的选项。 */
export interface MemoryProfileBackendOptions {
  /** 共用的远程；不给时没有远程（`sync` 返回 `no_remote`）。 */
  readonly remote?: MemoryProfileRemote;
}

/** 按 {@link PROFILE_DOCUMENTS} 的顺序排列。 */
const ordered = (documents: Iterable<ProfileDocument>): ProfileDocument[] => {
  const set = new Set(documents);
  return PROFILE_DOCUMENTS.filter((document) => set.has(document));
};

/**
 * 内存后端，测试用。模拟一台设备：本地完整副本，加上和 {@link MemoryProfileRemote} 的同步。
 *
 * 同步规则：只有一边改过的文档直接拉取或推送；两边都改过且内容不同时成为冲突，保留本地版本。
 * 冲突按文档整体解决（`local` 或 `remote`），还不做结构化的合并（8.1）。
 */
export class MemoryProfileBackend implements ProfileBackend {
  readonly #remote: MemoryProfileRemote | undefined;
  #local: Map<ProfileDocument, unknown> | null = null;
  /** 每个文档上次同步时远程的版本号（0 表示从没同步过）。 */
  readonly #base = new Map<ProfileDocument, number>();
  /** 本地改过、还没推送的文档。 */
  readonly #dirty = new Set<ProfileDocument>();
  /** 冲突的文档 → 冲突时远程的版本。 */
  readonly #conflicts = new Map<ProfileDocument, RemoteDocument>();
  readonly #listeners = new Set<(change: ProfileChange) => void>();
  #revision = 0;
  #online = true;
  #lastSyncedAt: IsoDateTime | null = null;

  constructor(options: MemoryProfileBackendOptions = {}) {
    this.#remote = options.remote;
  }

  /** 模拟断网或恢复网络。离线时读写照常，只有同步会失败。 */
  setOnline(online: boolean): void {
    this.#online = online;
  }

  /** 模拟别的程序（比如文本编辑器）直接修改了一个文档。内容不做任何校验。 */
  editExternally(document: ProfileDocument, data: unknown): void {
    this.#local ??= new Map();
    this.#local.set(document, cloneJson(data));
    this.#dirty.add(document);
    this.#bump([document], 'external');
  }

  read(): Promise<BackendSnapshot | null> {
    return Promise.resolve(this.#snapshot());
  }

  write(
    documents: Partial<Record<ProfileDocument, unknown>>,
    base: Revision | null,
  ): Promise<BackendWriteResult> {
    const changed = ordered(Object.keys(documents) as ProfileDocument[]);
    if (base === null) {
      if (this.#local !== null)
        return Promise.resolve({ ok: false, reason: 'exists' });
      this.#local = new Map();
    } else if (this.#local === null || base !== this.#revisionString()) {
      return Promise.resolve({ ok: false, reason: 'modified' });
    }
    for (const document of changed) {
      this.#local.set(document, cloneJson(documents[document]));
      this.#dirty.add(document);
    }
    this.#bump(changed, 'local');
    return Promise.resolve({ ok: true, revision: this.#revisionString() });
  }

  watch(listener: (change: ProfileChange) => void): Unwatch {
    const wrapped = (change: ProfileChange) => listener(change);
    this.#listeners.add(wrapped);
    return () => {
      this.#listeners.delete(wrapped);
    };
  }

  syncStatus(): Promise<SyncStatus> {
    return Promise.resolve({
      remote: this.#remote === undefined ? 'none' : 'configured',
      online: this.#online,
      pendingChanges: this.#dirty.size,
      lastSyncedAt: this.#lastSyncedAt,
      conflicts: ordered(this.#conflicts.keys()),
    });
  }

  sync(at: IsoDateTime): Promise<SyncResult> {
    const remote = this.#remote;
    const result = (
      status: SyncResult['status'],
      pulled: ProfileDocument[] = [],
      pushed: ProfileDocument[] = [],
    ): Promise<SyncResult> =>
      Promise.resolve({
        status,
        pulled,
        pushed,
        conflicts: ordered(this.#conflicts.keys()),
      });
    if (remote === undefined) return result('no_remote');
    if (!this.#online) return result('offline');

    const pulled: ProfileDocument[] = [];
    const pushed: ProfileDocument[] = [];
    for (const document of PROFILE_DOCUMENTS) {
      const there = remote.documents.get(document);
      const base = this.#base.get(document) ?? 0;
      const remoteChanged = there !== undefined && there.version !== base;
      const localChanged = this.#dirty.has(document);
      if (this.#conflicts.has(document)) {
        // 冲突还没解决：只记下远程的最新版本，不动本地。
        if (there !== undefined) this.#conflicts.set(document, there);
        continue;
      }
      if (localChanged && this.#local?.has(document) === true) {
        if (
          remoteChanged &&
          !deepEqual(there.data, this.#local.get(document))
        ) {
          this.#conflicts.set(document, there);
          continue;
        }
        const version = (there?.version ?? 0) + 1;
        remote.documents.set(document, {
          data: cloneJson(this.#local.get(document)),
          version,
        });
        this.#base.set(document, version);
        this.#dirty.delete(document);
        pushed.push(document);
      } else if (remoteChanged) {
        this.#local ??= new Map();
        this.#local.set(document, cloneJson(there.data));
        this.#base.set(document, there.version);
        pulled.push(document);
      }
    }
    this.#lastSyncedAt = at;
    if (pulled.length > 0) this.#bump(pulled, 'sync');
    return result('synced', pulled, pushed);
  }

  resolveConflict(
    document: ProfileDocument,
    choice: ConflictChoice,
  ): Promise<
    { readonly ok: true; readonly revision: Revision } | { readonly ok: false }
  > {
    const conflict = this.#conflicts.get(document);
    if (conflict === undefined || this.#local === null)
      return Promise.resolve({ ok: false });
    this.#conflicts.delete(document);
    this.#base.set(document, conflict.version);
    if (choice === 'remote') {
      this.#local.set(document, cloneJson(conflict.data));
      this.#dirty.delete(document);
    } else {
      // 保留本地版本：它现在是在远程版本之上的修改，下次同步时推送。
      this.#dirty.add(document);
    }
    this.#bump([document], 'local');
    return Promise.resolve({ ok: true, revision: this.#revisionString() });
  }

  #revisionString(): Revision {
    return `r${String(this.#revision)}`;
  }

  #snapshot(): BackendSnapshot | null {
    const local = this.#local;
    if (local === null || PROFILE_DOCUMENTS.some((d) => !local.has(d)))
      return null;
    return {
      documents: Object.fromEntries(
        PROFILE_DOCUMENTS.map((document) => [
          document,
          cloneJson(local.get(document)),
        ]),
      ) as Record<ProfileDocument, unknown>,
      revision: this.#revisionString(),
      conflicts: ordered(this.#conflicts.keys()),
    };
  }

  #bump(
    documents: readonly ProfileDocument[],
    source: ProfileChange['source'],
  ): void {
    this.#revision += 1;
    for (const listener of [...this.#listeners]) {
      for (const document of documents) listener({ document, source });
    }
  }
}

/** 内存实现：store 加上它的后端（测试里用后端模拟断网、外部修改）。 */
export interface MemoryProfile {
  readonly store: ProfileStore;
  readonly backend: MemoryProfileBackend;
}

/**
 * 创建一个内存的 Profile store，测试用。
 *
 * @param options - `now`、`generateId`（必须给），可选的共用远程和重试次数
 */
export function createMemoryProfileStore(
  options: ProfileStoreOptions & MemoryProfileBackendOptions,
): MemoryProfile {
  const backend = new MemoryProfileBackend(options);
  return { store: createProfileStore(backend, options), backend };
}
