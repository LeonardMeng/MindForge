import { isPlatformError, type FileSystem } from '@mastery/platform';
import type {
  DeviceConfig,
  DevicePlatform,
  WorkspaceRegistry,
} from '@mastery/schema';
import {
  yamlFile,
  type Snapshot,
  type StoreIssue,
  type StoreOptions,
} from '@mastery/store';

/** `device.yaml` 在设备目录（通常是 `~/.mastery/`）里的文件名。 */
export const DEVICE_FILE = 'device.yaml';

/**
 * 设备目录里的 `.gitignore`，只有一行 `*`：即使设备目录被放进了某个 Git 仓库（比如把整个
 * home 目录纳入版本管理的 dotfiles 仓库，{@link checkDeviceLocation} 发现不了这种情况），
 * 里面的东西也不会被提交。
 */
export const DEVICE_GITIGNORE = { path: '.gitignore', content: '*\n' } as const;

/** 新设备的同步默认值。 */
export const DEFAULT_SYNC = {
  on_metered_network: false,
  interval_minutes: 15,
} as const;
/** 新设备的缓存上限（MB）。 */
export const DEFAULT_MAX_CACHE_MB = 2048;

/** 设备相关的错误码。 */
export type DeviceErrorCode =
  | 'device.invalid'
  | 'device.version_too_new'
  | 'device.modified_since_read'
  | 'device.already_exists'
  | 'device.cloud_profile_unsupported';

const MESSAGES: Readonly<Record<DeviceErrorCode, string>> = {
  'device.invalid': 'device.yaml is not valid; see the issues',
  'device.version_too_new':
    'device.yaml was written by a newer version of Mastery OS; upgrade Mastery OS to change it',
  'device.modified_since_read':
    'device.yaml changed since it was read; read it again and reapply the change',
  'device.already_exists': 'device.yaml already exists',
  'device.cloud_profile_unsupported':
    'cloud profiles (profile.store: cloud) are not supported yet; use store: git',
};

/** 操作失败的原因。 */
export interface DeviceError {
  readonly code: DeviceErrorCode;
  readonly message: string;
  /** 具体的问题（解析、校验错误等）。 */
  readonly issues: readonly StoreIssue[];
}

/** 操作的结果。I/O 错误照常抛出。 */
export type DeviceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DeviceError };

/** 读出的 device.yaml。 */
export interface LoadedDevice {
  readonly config: DeviceConfig;
  /** 保存时作为 `base` 传回来。 */
  readonly snapshot: Snapshot;
}

const fail = <T>(
  code: DeviceErrorCode,
  issues: readonly StoreIssue[] = [],
): DeviceResult<T> => ({
  ok: false,
  error: { code, message: MESSAGES[code], issues },
});

/** store 的写入问题换成设备的错误码。 */
function fromWriteIssues<T>(issues: readonly StoreIssue[]): DeviceResult<T> {
  const codes = new Set(issues.map((issue) => issue.code));
  if (codes.has('store.modified_since_read'))
    return fail('device.modified_since_read', issues);
  if (codes.has('store.already_exists'))
    return fail('device.already_exists', issues);
  if (codes.has('store.version_too_new'))
    return fail('device.version_too_new', issues);
  return fail('device.invalid', issues);
}

const file = (fs: FileSystem, options?: StoreOptions) =>
  yamlFile(fs, DEVICE_FILE, 'device', options);

/**
 * 读取 `device.yaml`。文件不存在时返回 null（首次运行，或者丢失了）。
 * `profile.store: cloud` 在 9.7 之前返回 `device.cloud_profile_unsupported`，不会当成 git 处理。
 *
 * @param fs - 以设备目录（通常是 `~/.mastery/`）为根的文件系统
 */
export async function loadDevice(
  fs: FileSystem,
): Promise<DeviceResult<LoadedDevice> | null> {
  const read = await file(fs).read();
  if (read === null) return null;
  if (!read.ok)
    return fail(
      read.readOnly ? 'device.version_too_new' : 'device.invalid',
      read.issues,
    );
  if (read.value.profile.store === 'cloud')
    return fail('device.cloud_profile_unsupported');
  return { ok: true, value: { config: read.value, snapshot: read.snapshot } };
}

/**
 * 保存 `device.yaml`。带 `base` 时更新已有的文件（读取之后被改过就报 `device.modified_since_read`，
 * 只改动变化的部分）；不带时创建新文件（已存在时报 `device.already_exists`）。
 *
 * @param fs - 以设备目录为根的文件系统
 * @param config - 新的内容
 * @param options - 读取时的 snapshot
 */
export async function saveDevice(
  fs: FileSystem,
  config: DeviceConfig,
  options: { readonly base?: Snapshot } = {},
): Promise<DeviceResult<Snapshot>> {
  if (config.profile.store === 'cloud')
    return fail('device.cloud_profile_unsupported');
  const saved = await file(fs).save(config, options);
  return saved.ok
    ? { ok: true, value: saved.snapshot }
    : fromWriteIssues(saved.issues);
}

/** 新建设备配置需要的信息。 */
export interface NewDevice {
  /** 显示名称，比如“工作笔记本”。 */
  readonly name: string;
  readonly platform: DevicePlatform;
  /** Profile 仓库在本机的位置（绝对路径）。 */
  readonly profilePath: string;
  /** 外部资源文件的位置（绝对路径）。 */
  readonly resourcesDir: string;
  /** 生成设备的 ULID（`device` 不直接用 Platform 的 IdGenerator，由调用方传入）。 */
  readonly generateId: () => string;
}

/** 在设备目录里放一个 `.gitignore`（内容是 `*`）；已经有的不动。 */
export async function ensureDeviceGitignore(fs: FileSystem): Promise<void> {
  try {
    await fs.createTextFile(DEVICE_GITIGNORE.path, DEVICE_GITIGNORE.content);
  } catch (error) {
    if (!isPlatformError(error, 'platform.already_exists')) throw error;
  }
}

function newConfig(device: NewDevice): DeviceConfig {
  return {
    schema_version: 1,
    device: {
      id: device.generateId(),
      name: device.name,
      platform: device.platform,
    },
    profile: { store: 'git', path: device.profilePath },
    workspaces: {},
    sync: { ...DEFAULT_SYNC },
    storage: {
      resources_dir: device.resourcesDir,
      max_cache_mb: DEFAULT_MAX_CACHE_MB,
    },
    models: { local_runtime: null, local_endpoint: null },
  } as DeviceConfig;
}

/**
 * 首次运行：生成设备 ULID，创建 `device.yaml`（没有任何 Workspace）。先创建设备目录的 `.gitignore`。
 * `device.yaml` 已经存在时报 `device.already_exists`，什么都不改。
 *
 * @param fs - 以设备目录为根的文件系统
 * @param device - 名称、平台、Profile 位置等
 */
export async function initDevice(
  fs: FileSystem,
  device: NewDevice,
): Promise<DeviceResult<LoadedDevice>> {
  await ensureDeviceGitignore(fs);
  const config = newConfig(device);
  const saved = await saveDevice(fs, config);
  return saved.ok
    ? { ok: true, value: { config, snapshot: saved.value } }
    : saved;
}

/** {@link regenerateDevice} 的结果。 */
export interface RegeneratedDevice extends LoadedDevice {
  /** Profile 里注册了、需要用户确认本机路径的 Workspace（新的 device.yaml 里还没有它们）。 */
  readonly toConfirm: WorkspaceRegistry['workspaces'];
}

/**
 * `device.yaml` 丢失后根据 Profile 重新生成：新的设备 id（原来的找不回来），**不包含任何 Workspace**，
 * 因为本机路径要用户重新确认（README 第 7 节）。返回需要确认的 Workspace。
 * 文件还存在时报 `device.already_exists`（损坏的文件由调用方先挪开）。
 *
 * @param fs - 以设备目录为根的文件系统
 * @param registry - Profile 的 `workspaces.yaml`
 * @param device - 名称、平台、Profile 位置等
 */
export async function regenerateDevice(
  fs: FileSystem,
  registry: WorkspaceRegistry,
  device: NewDevice,
): Promise<DeviceResult<RegeneratedDevice>> {
  const created = await initDevice(fs, device);
  if (!created.ok) return created;
  return {
    ok: true,
    value: { ...created.value, toConfirm: [...registry.workspaces] },
  };
}

/** 一个 Workspace 在这台设备上的状态（只根据两份配置，不看磁盘）。 */
export type WorkspaceState =
  /** Profile 里注册了，device.yaml 里也有它的位置。是否真的在磁盘上由 CLI 检查（1.15）。 */
  | 'configured'
  /** Profile 里注册了，device.yaml 里没有：这台设备还没配置它，UI 里显示为可下载。 */
  | 'not_configured'
  /** device.yaml 里有，但 Profile 里已经注销：提示用户保留本地副本还是删除。 */
  | 'unregistered_local';

/** {@link workspaceStates} 的一项。 */
export interface WorkspaceStatus {
  readonly id: string;
  readonly state: WorkspaceState;
  /** Profile 里的名称（`unregistered_local` 时为 null）。 */
  readonly name: string | null;
  /** device.yaml 里的本机路径（`not_configured` 时为 null）。 */
  readonly path: string | null;
}

/**
 * 对照 Profile 的 `workspaces.yaml` 和 `device.yaml`，算出每个 Workspace 在这台设备上的状态。
 * 纯函数：只看配置，不看磁盘。`sync` 方式（比如 `on-demand`）说的是什么时候拉取，不表示在不在本机。
 *
 * @returns 先按 Profile 里的顺序列出注册的 Workspace，再按 id 列出已注销的
 */
export function workspaceStates(
  device: DeviceConfig,
  registry: WorkspaceRegistry,
): WorkspaceStatus[] {
  const local = device.workspaces as Readonly<
    Record<string, { readonly path: string }>
  >;
  const registered = new Set<string>(
    registry.workspaces.map((workspace) => workspace.id),
  );
  const states: WorkspaceStatus[] = registry.workspaces.map((workspace) => {
    const entry = local[workspace.id];
    return entry === undefined
      ? {
          id: workspace.id,
          state: 'not_configured',
          name: workspace.name,
          path: null,
        }
      : {
          id: workspace.id,
          state: 'configured',
          name: workspace.name,
          path: entry.path,
        };
  });
  const orphans = Object.keys(local)
    .filter((id) => !registered.has(id))
    .sort();
  for (const id of orphans) {
    states.push({
      id,
      state: 'unregistered_local',
      name: null,
      path: local[id]?.path ?? null,
    });
  }
  return states;
}

/** {@link checkDeviceLocation} 发现的问题。 */
export interface DeviceLocationIssue {
  readonly code: 'device.inside_repository';
  /** 包含设备目录的是 Profile 还是某个 Workspace。 */
  readonly owner: 'profile' | 'workspace';
  /** Workspace 的 id（`owner` 是 `profile` 时为 null）。 */
  readonly id: string | null;
  /** 那个仓库的路径（device.yaml 里的写法）。 */
  readonly path: string;
  readonly message: string;
}

/** 把路径规范化，便于比较：展开 `~`，`\` 换成 `/`，去掉末尾的 `/`；Windows 盘符路径不区分大小写。 */
function normalizeLocalPath(path: string, home: string): string {
  let result =
    path === '~' || path.startsWith('~/') || path.startsWith('~\\')
      ? home + path.slice(1)
      : path;
  result = result.replace(/\\/g, '/').replace(/\/+$/, '');
  return /^[A-Za-z]:/.test(result) || result.startsWith('//')
    ? result.toLowerCase()
    : result;
}

/**
 * 检查设备目录有没有落在 Profile 或某个 Workspace 的仓库里（那样 device.yaml 就可能被提交）。
 * 比如 Workspace 放在 `~`，设备目录 `~/.mastery/` 就在它里面。
 * 设备目录里的 `.gitignore`（`*`）是另一道保险，覆盖这里检查不到的情况（比如 dotfiles 仓库）。
 *
 * @param deviceDir - 设备目录的绝对路径（可以用 `~`）
 * @param device - device.yaml 的内容
 * @param home - 用户主目录的绝对路径，用来展开 `~`
 */
export function checkDeviceLocation(
  deviceDir: string,
  device: DeviceConfig,
  home: string,
): DeviceLocationIssue[] {
  const dir = normalizeLocalPath(deviceDir, home);
  const inside = (repository: string) => {
    const root = normalizeLocalPath(repository, home);
    return dir === root || dir.startsWith(`${root}/`);
  };
  const issue = (
    owner: DeviceLocationIssue['owner'],
    id: string | null,
    path: string,
  ): DeviceLocationIssue => ({
    code: 'device.inside_repository',
    owner,
    id,
    path,
    message: `the device folder ${deviceDir} is inside the ${owner === 'profile' ? 'profile' : `workspace "${id ?? ''}"`} repository at ${path}; device.yaml must never be committed, so move one of them`,
  });
  const issues: DeviceLocationIssue[] = [];
  if (device.profile.store === 'git' && inside(device.profile.path)) {
    issues.push(issue('profile', null, device.profile.path));
  }
  const workspaces = device.workspaces as Readonly<
    Record<string, { readonly path: string }>
  >;
  for (const id of Object.keys(workspaces).sort()) {
    const path = workspaces[id]?.path;
    if (path !== undefined && inside(path))
      issues.push(issue('workspace', id, path));
  }
  return issues;
}
