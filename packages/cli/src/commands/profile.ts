import { mkdir, readdir } from 'node:fs/promises';

import { isPlatformError, type FileSystem } from '@mastery/platform';
import {
  checkDeviceLocation,
  initDevice,
  loadDevice,
  regenerateDevice,
  workspaceStates,
  type DeviceError,
  type LoadedDevice,
} from '@mastery/device';
import {
  createNodePlatform,
  NodeFileSystem,
  NodeIdGenerator,
} from '@mastery/platform-node';
import type { ProfileError, ProfileStore } from '@mastery/profile';
import {
  createGitProfileStore,
  PROFILE_FILES,
} from '@mastery/profile-store-git';
import { formatStoreIssue } from '@mastery/store';
import type { DevicePlatform } from '@mastery/schema';

import { EXIT, type CliContext, type ExitCode } from '../context.js';
import {
  canonicalPath,
  findGitWorkTree,
  isDirectory,
  resolveUserPath,
} from '../paths.js';

/** Profile 目录的 `.gitignore`：写锁的锁文件和崩溃留下的临时文件都不提交。 */
export const PROFILE_GITIGNORE = '.mastery/\n.mastery-tmp-*\n';

/** 没有给出位置时的 Profile 目录。 */
export const DEFAULT_PROFILE_DIR = '~/MasteryProfile';
/** 新设备的资源目录。 */
export const DEFAULT_RESOURCES_DIR = '~/Mastery/_resources';

/** 一个“失败并说明原因”的结果：消息已经写到 stderr，返回退出码。 */
export class CommandError extends Error {
  constructor(
    message: string,
    readonly exitCode: ExitCode = EXIT.failed,
  ) {
    super(message);
  }
}

/** 设备错误的完整说明（带具体问题）。 */
export function describeDeviceError(error: DeviceError): string {
  return [
    error.message,
    ...error.issues.map((i) => `  ${formatStoreIssue(i)}`),
  ].join('\n');
}

/** Profile 错误的完整说明（带具体问题）。 */
export function describeProfileError(error: ProfileError): string {
  return [
    error.message,
    ...error.issues.map(
      (i) =>
        `  ${PROFILE_FILES[i.document]} (${i.path.map(String).join('.')}): ${i.message}`,
    ),
  ].join('\n');
}

/** `process.platform` → device.yaml 的 `platform`。 */
export function devicePlatform(platform: string): DevicePlatform {
  switch (platform) {
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'windows';
    case 'android':
      return 'android';
    default:
      return 'linux';
  }
}

/** 系统的语言区域变成 Profile 接受的写法；不合格时用 `en`。 */
export function defaultLanguage(locale: string): string {
  const tag = locale.replace(/_/g, '-').split('.')[0] ?? '';
  const [language = '', ...rest] = tag.split('-');
  const parts = [language.toLowerCase()];
  for (const part of rest) {
    if (/^[A-Za-z]{4}$/.test(part))
      parts.push(part[0]?.toUpperCase() + part.slice(1).toLowerCase());
    else if (/^[A-Za-z]{2}$/.test(part)) parts.push(part.toUpperCase());
    else if (/^\d{3}$/.test(part)) parts.push(part);
  }
  const candidate = parts.join('-');
  return /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|\d{3}))?$/.test(
    candidate,
  )
    ? candidate
    : 'en';
}

/** device.yaml 里 Profile 的位置（`loadDevice` 已经拒绝了 cloud，这里只是让类型收窄）。 */
export function profilePathOf(config: LoadedDevice['config']): string {
  return config.profile.store === 'git'
    ? config.profile.path
    : config.profile.cache_path;
}

/** 打开设备目录（不存在时创建）。 */
export async function openDeviceFs(context: CliContext): Promise<FileSystem> {
  await mkdir(context.deviceDir, { recursive: true });
  return NodeFileSystem.open(context.deviceDir);
}

/** 设备目录在 Git 工作区里时给出警告（`.gitignore` 的 `*` 已经保证不会提交）。 */
export function warnIfDeviceDirInGitTree(context: CliContext): void {
  const tree = findGitWorkTree(context.deviceDir);
  if (tree !== null) {
    context.stderr.write(
      `warning: the device folder ${context.deviceDir} is inside a Git work tree (${tree}). ` +
        'Its .gitignore keeps device.yaml out of commits, but you may want to move it.\n',
    );
  }
}

/** 打开 Profile 目录上的 store。 */
export async function openProfileStore(
  profileDir: string,
): Promise<ProfileStore> {
  const platform = await createNodePlatform({ root: profileDir });
  return createGitProfileStore({
    fs: platform.fs,
    lock: platform.lock,
    now: () => platform.clock.now(),
    generateId: () => platform.ids.ulid(),
  });
}

/** 已经配置好的设备和它的 Profile。 */
export interface Environment {
  readonly deviceFs: FileSystem;
  readonly device: LoadedDevice;
  readonly profileDir: string;
  readonly profile: ProfileStore;
}

const NO_PROFILE_HINT =
  'there is no profile on this device yet; run `mastery profile init` first';

/** 读取 device.yaml 和它指向的 Profile；没有时抛出 {@link CommandError}，带上下一步的提示。 */
export async function loadEnvironment(
  context: CliContext,
): Promise<Environment> {
  const deviceFs = await openDeviceFs(context);
  const loaded = await loadDevice(deviceFs);
  if (loaded === null) throw new CommandError(NO_PROFILE_HINT);
  if (!loaded.ok)
    throw new CommandError(
      `${context.deviceDir}/device.yaml: ${describeDeviceError(loaded.error)}`,
    );
  const device = loaded.value;
  if (device.config.profile.store !== 'git')
    throw new CommandError('only git profiles are supported');
  const profileDir = resolveUserPath(device.config.profile.path, context);
  if (!isDirectory(profileDir)) {
    throw new CommandError(
      `the profile folder ${device.config.profile.path} (from device.yaml) does not exist; ` +
        'restore it, or move device.yaml away and run `mastery profile init` again',
    );
  }
  return {
    deviceFs,
    device,
    profileDir,
    profile: await openProfileStore(profileDir),
  };
}

/** `profile init` 的选项。 */
export interface ProfileInitOptions {
  readonly dir: string | undefined;
  readonly name: string | undefined;
  readonly language: string | undefined;
  readonly weeklyMinutes: string | undefined;
}

/**
 * `mastery profile init [dir]`：创建 Profile 和 device.yaml。
 *
 * 目标目录里已经有 Profile 而这台设备还没有 device.yaml 时（device.yaml 丢失，或者上次在创建
 * device.yaml 之前崩溃），直接用这个 Profile，根据它重新生成 device.yaml。
 */
export async function profileInit(
  context: CliContext,
  options: ProfileInitOptions,
): Promise<ExitCode> {
  const deviceFs = await openDeviceFs(context);
  const existing = await loadDevice(deviceFs);
  if (existing !== null) {
    if (!existing.ok)
      throw new CommandError(
        `${context.deviceDir}/device.yaml: ${describeDeviceError(existing.error)}`,
      );
    throw new CommandError(
      `this device already has a profile at ${profilePathOf(existing.value.config)}`,
    );
  }

  let weeklyMinutes: number | null = null;
  if (options.weeklyMinutes !== undefined) {
    weeklyMinutes = Number(options.weeklyMinutes);
    if (!Number.isInteger(weeklyMinutes)) {
      throw new CommandError(
        '--weekly-minutes must be a whole number',
        EXIT.usage,
      );
    }
  }

  const profileDir = resolveUserPath(
    options.dir ?? DEFAULT_PROFILE_DIR,
    context,
  );
  await mkdir(profileDir, { recursive: true });
  const store = await openProfileStore(profileDir);
  const loaded = await store.load();
  if (loaded.ok) {
    // 已经有 Profile：下面根据它重新生成 device.yaml。
  } else if (loaded.error.code === 'profile.not_found') {
    const others = (await readdir(profileDir)).filter(
      (name) =>
        name !== '.mastery' &&
        name !== '.gitignore' &&
        !Object.values(PROFILE_FILES).includes(name as never),
    );
    if (others.length > 0) {
      throw new CommandError(
        `${profileDir} is not empty and does not contain a profile`,
      );
    }
    const created = await store.create({
      name: options.name ?? context.username,
      language: options.language ?? defaultLanguage(context.locale),
      weekly_minutes: weeklyMinutes,
    });
    if (!created.ok)
      throw new CommandError(describeProfileError(created.error));
  } else {
    throw new CommandError(
      `${profileDir}: ${describeProfileError(loaded.error)}`,
    );
  }

  const profileFs = await NodeFileSystem.open(profileDir);
  try {
    await profileFs.createTextFile('.gitignore', PROFILE_GITIGNORE);
  } catch (error) {
    if (!isPlatformError(error, 'platform.already_exists')) throw error;
  }

  const ids = new NodeIdGenerator();
  const newDevice = {
    name: context.hostname,
    platform: devicePlatform(context.platform),
    profilePath: canonicalPath(profileDir, context.home),
    resourcesDir: DEFAULT_RESOURCES_DIR,
    generateId: () => ids.ulid(),
  };
  if (loaded.ok) {
    const regenerated = await regenerateDevice(
      deviceFs,
      loaded.value.profile.workspaces,
      newDevice,
    );
    if (!regenerated.ok)
      throw new CommandError(describeDeviceError(regenerated.error));
    context.stdout.write(
      `Using the existing profile in ${newDevice.profilePath}; created device.yaml.\n`,
    );
    if (regenerated.value.toConfirm.length > 0) {
      context.stdout.write(
        `Workspaces registered in this profile (not set up on this device yet): ${regenerated.value.toConfirm.map((w) => w.id).join(', ')}\n`,
      );
    }
  } else {
    const created = await initDevice(deviceFs, newDevice);
    if (!created.ok) throw new CommandError(describeDeviceError(created.error));
    context.stdout.write(
      `Created a profile in ${newDevice.profilePath} and ${context.deviceDir}/device.yaml.\n`,
    );
  }
  warnIfDeviceDirInGitTree(context);
  context.stdout.write(`Next: cd ${profileDir} && git init\n`);
  return EXIT.ok;
}

/**
 * `mastery profile show [--json]`：Profile 和本机 Workspace 的状态。`configured` 的 Workspace
 * 按目录是否存在细分为 `pulled` 或 `missing`。
 */
export async function profileShow(
  context: CliContext,
  json: boolean,
): Promise<ExitCode> {
  const env = await loadEnvironment(context);
  const loaded = await env.profile.load();
  if (!loaded.ok)
    throw new CommandError(
      `${env.profileDir}: ${describeProfileError(loaded.error)}`,
    );
  const { profile, issues } = loaded.value;
  const states = workspaceStates(env.device.config, profile.workspaces).map(
    (status) => ({
      ...status,
      state:
        status.state === 'configured'
          ? isDirectory(resolveUserPath(status.path ?? '', context))
            ? ('pulled' as const)
            : ('missing' as const)
          : status.state,
    }),
  );
  const location = checkDeviceLocation(
    context.deviceDir,
    env.device.config,
    context.home,
  );
  if (json) {
    context.stdout.write(
      `${JSON.stringify(
        {
          profile: {
            ...profile.config,
            path: profilePathOf(env.device.config),
          },
          device: env.device.config.device,
          workspaces: states,
          issues: [
            ...issues.map((i) => i.message),
            ...location.map((i) => i.message),
          ],
        },
        null,
        2,
      )}\n`,
    );
    return EXIT.ok;
  }
  const config = profile.config;
  context.stdout.write(
    `Profile: ${config.name} (${config.id}) in ${profilePathOf(env.device.config)}\n`,
  );
  context.stdout.write(
    `Language: ${config.language}; weekly budget: ${config.weekly_minutes === null ? 'not set' : `${String(config.weekly_minutes)} min`}\n`,
  );
  context.stdout.write(
    `Device: ${env.device.config.device.name} (${env.device.config.device.platform})\n`,
  );
  context.stdout.write(
    states.length === 0 ? 'No workspaces yet.\n' : 'Workspaces:\n',
  );
  const label = {
    pulled: 'on this device',
    missing: 'missing (folder not found)',
    not_configured: 'not set up on this device',
    unregistered_local: 'no longer in the profile',
  } as const;
  for (const status of states) {
    context.stdout.write(
      `  ${status.id.padEnd(20)} ${label[status.state].padEnd(28)} ${status.path ?? ''}\n`.replace(
        / +\n$/,
        '\n',
      ),
    );
  }
  for (const issue of [...issues, ...location])
    context.stderr.write(`warning: ${issue.message}\n`);
  warnIfDeviceDirInGitTree(context);
  return EXIT.ok;
}
