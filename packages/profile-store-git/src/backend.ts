import { isPlatformError, type FileSystem, type Lock } from '@mastery/platform';
import {
  createProfileStore,
  PROFILE_DOCUMENTS,
  type BackendDocument,
  type BackendIssue,
  type BackendSnapshot,
  type BackendWrite,
  type BackendWriteResult,
  type ProfileBackend,
  type ProfileChange,
  type ProfileDocument,
  type ProfileStore,
  type ProfileStoreOptions,
  type Revision,
  type SyncResult,
  type SyncStatus,
  type Unwatch,
} from '@mastery/profile';
import {
  fromRawIssue,
  parseYaml,
  patchYaml,
  stringifyYaml,
} from '@mastery/store';

/** 每个文档在 Profile 根目录下的文件名。 */
export const PROFILE_FILES = {
  profile: 'profile.yaml',
  workspaces: 'workspaces.yaml',
  'concept-links': 'concept-links.yaml',
  defaults: 'defaults.yaml',
} as const satisfies Record<ProfileDocument, string>;

/** 写入 Profile 时持有的锁的名字。8.1 的 Git 同步也必须持有同一把锁。 */
export const PROFILE_WRITE_LOCK = 'profile-write';

const DEFAULT_LOCK_TIMEOUT_MS = 30_000;

/** {@link createGitProfileBackend} 的选项。 */
export interface GitProfileBackendOptions {
  /** 以 Profile 根目录为根的文件系统。 */
  readonly fs: FileSystem;
  /**
   * 写锁。锁文件应该放在 Profile 的 `.mastery/runtime/locks/` 里（`createNodePlatform` 的默认位置），
   * `.mastery/` 由 `.gitignore` 忽略（1.15）。
   */
  readonly lock: Lock;
  /** 等写锁的最长时间，默认 30 秒。 */
  readonly lockTimeoutMs?: number;
}

/** 一个文件的当前状态：内容（不存在时为 null）和内容的哈希。 */
interface FileState {
  readonly text: string | null;
  readonly hash: string | null;
}

type FileStates = Readonly<Record<ProfileDocument, FileState>>;

/** 文本按 UTF-8 编码后的 SHA-256（Web Crypto，Node、浏览器、Web Worker 都有）。 */
async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Profile 的 revision：先分别算每个文件的哈希，再对按文档顺序排列的
 * `[文档名, 文件哈希或 "missing"]` 列表算哈希。不直接拼接文件内容：拼接有歧义（`"ab"+"c"` 和 `"a"+"bc"`）。
 *
 * @param hashes - 每个文档和它的文件哈希（文件不存在时为 null），按 {@link PROFILE_DOCUMENTS} 的顺序
 */
export async function profileRevision(
  hashes: readonly (readonly [ProfileDocument, string | null])[],
): Promise<Revision> {
  return sha256Hex(
    JSON.stringify(
      hashes.map(([document, hash]) => [document, hash ?? 'missing']),
    ),
  );
}

/**
 * 基于文件的 {@link ProfileBackend}：四个 YAML 文件放在 Profile 根目录（`profile.yaml`、
 * `workspaces.yaml`、`concept-links.yaml`、`defaults.yaml`）。
 *
 * - 只保存文档，**不检查任何规则**（规则由 `createProfileStore` 执行）。
 * - 读用 store 的严格 YAML 解析；写的时候只改动变化的部分（注释保留），每个文件原子写入。
 * - 一次写入（重新读取、比较 revision、按顺序写入全部文件）在写锁里完成，不会被别的进程插进来。
 * - 现在还没有 Git 提交（3.6）和远程同步（8.1）：`syncStatus().remote` 是 `none`。
 *
 * @param options - 文件系统、写锁
 */
export function createGitProfileBackend(
  options: GitProfileBackendOptions,
): ProfileBackend {
  const { fs, lock } = options;
  const lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const listeners = new Set<(change: ProfileChange) => void>();
  /** 自己写入的内容的哈希：文件监听报告这些变化时不当作外部修改。 */
  const ownWrites = new Map<ProfileDocument, string>();

  async function readFile(
    document: ProfileDocument,
  ): Promise<FileState | 'invalid_encoding'> {
    try {
      const text = await fs.readTextFile(PROFILE_FILES[document]);
      return { text, hash: await sha256Hex(text) };
    } catch (error) {
      if (isPlatformError(error, 'platform.not_found'))
        return { text: null, hash: null };
      if (isPlatformError(error, 'platform.invalid_encoding'))
        return 'invalid_encoding';
      throw error;
    }
  }

  /** 读出四个文件，以及每个文档的解析结果。 */
  async function readAll(): Promise<{
    readonly states: FileStates;
    readonly documents: Record<ProfileDocument, BackendDocument>;
    readonly revision: Revision;
  }> {
    const states = {} as Record<ProfileDocument, FileState>;
    const documents = {} as Record<ProfileDocument, BackendDocument>;
    for (const document of PROFILE_DOCUMENTS) {
      const file = PROFILE_FILES[document];
      const read = await readFile(document);
      if (read === 'invalid_encoding') {
        // 解析不了的文件仍然参与 revision（用它的字节无法算哈希，就用固定的标记）。
        states[document] = { text: null, hash: 'invalid-encoding' };
        documents[document] = {
          status: 'unreadable',
          issues: [
            {
              code: 'store.invalid_encoding',
              path: [],
              params: {},
              message: `${file} is not valid UTF-8`,
            },
          ],
        };
        continue;
      }
      states[document] = read;
      if (read.text === null) {
        documents[document] = { status: 'missing' };
        continue;
      }
      const parsed = parseYaml(read.text);
      documents[document] = parsed.ok
        ? { status: 'ok', data: parsed.data }
        : {
            status: 'unreadable',
            issues: parsed.issues.map((raw): BackendIssue => {
              const { code, path, params, message } = fromRawIssue(file, raw);
              return { code, path, params, message };
            }),
          };
    }
    const revision = await profileRevision(
      PROFILE_DOCUMENTS.map(
        (document) => [document, states[document].hash] as const,
      ),
    );
    return { states, documents, revision };
  }

  /** 要写入的文本：文件已存在且能解析时在原文上修改（保留注释），否则写成规范形式。 */
  function textFor(state: FileState, data: unknown): string {
    if (state.text !== null) {
      const parsed = parseYaml(state.text);
      if (parsed.ok) return patchYaml(state.text, parsed, data);
    }
    return stringifyYaml(data);
  }

  function emit(
    documents: readonly ProfileDocument[],
    source: ProfileChange['source'],
  ): void {
    for (const listener of [...listeners]) {
      for (const document of documents) listener({ document, source });
    }
  }

  return {
    async read(): Promise<BackendSnapshot | null> {
      const { documents, revision } = await readAll();
      if (documents.profile.status === 'missing') return null;
      return { documents, revision, conflicts: [] };
    },

    async write(
      writes: readonly BackendWrite[],
      base: Revision | null,
    ): Promise<BackendWriteResult> {
      const handle = await lock.acquire(PROFILE_WRITE_LOCK, {
        timeoutMs: lockTimeoutMs,
      });
      try {
        const { states, documents, revision } = await readAll();
        if (base === null) {
          if (documents.profile.status !== 'missing')
            return { ok: false, reason: 'exists' };
        } else if (
          documents.profile.status === 'missing' ||
          revision !== base
        ) {
          return { ok: false, reason: 'modified' };
        }
        const written: ProfileDocument[] = [];
        for (const { document, data } of writes) {
          const text = textFor(states[document], data);
          if (text === states[document].text) continue;
          // 先记下哈希再写：文件监听的通知可能在写入返回之前就到了。
          ownWrites.set(document, await sha256Hex(text));
          await fs.writeTextFile(PROFILE_FILES[document], text);
          written.push(document);
        }
        const after = await readAll();
        if (written.length > 0) emit(written, 'local');
        return { ok: true, revision: after.revision };
      } finally {
        await handle.release();
      }
    },

    watch(listener: (change: ProfileChange) => void): Unwatch {
      listeners.add(listener);
      let closed = false;
      const unwatchFs = fs.watch('', (event) => {
        const document = PROFILE_DOCUMENTS.find(
          (d) => PROFILE_FILES[d] === event.path,
        );
        if (document === undefined) return;
        void (async () => {
          const state = await readFile(document);
          const hash =
            state === 'invalid_encoding' ? 'invalid-encoding' : state.hash;
          if (closed || (hash !== null && ownWrites.get(document) === hash))
            return;
          listener({ document, source: 'external' });
        })().catch(() => undefined);
      });
      return () => {
        if (closed) return;
        closed = true;
        listeners.delete(listener);
        unwatchFs();
      };
    },

    syncStatus(): Promise<SyncStatus> {
      return Promise.resolve({
        remote: 'none',
        online: true,
        pendingChanges: 0,
        lastSyncedAt: null,
        conflicts: [],
      });
    },

    sync(): Promise<SyncResult> {
      return Promise.resolve({
        status: 'no_remote',
        pulled: [],
        pushed: [],
        conflicts: [],
      });
    },

    resolveConflict() {
      return Promise.resolve({ ok: false });
    },
  };
}

/**
 * 在文件上创建 Profile store：{@link createGitProfileBackend} 加上 `createProfileStore`（全部规则）。
 *
 * @param options - 文件系统、写锁、`now`、`generateId`
 */
export function createGitProfileStore(
  options: GitProfileBackendOptions & ProfileStoreOptions,
): ProfileStore {
  return createProfileStore(createGitProfileBackend(options), options);
}
