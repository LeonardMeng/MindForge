import { mkdir, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { checkDeviceLocation, loadDevice, saveDevice } from '@mastery/device';
import { isPlatformError } from '@mastery/platform';
import { NodeFileSystem } from '@mastery/platform-node';
import {
  Slug,
  WorkspaceConfig,
  WorkspaceRegistry,
  validate,
} from '@mastery/schema';
import { createStore, parseYaml } from '@mastery/store';

import { EXIT, type CliContext, type ExitCode } from '../context.js';
import { canonicalPath, isDirectory, resolveUserPath } from '../paths.js';
import {
  CommandError,
  describeDeviceError,
  describeProfileError,
  loadEnvironment,
  warnIfDeviceDirInGitTree,
} from './profile.js';

/** Workspace 的 `.gitignore`：索引、缓存、运行时状态和崩溃留下的临时文件都不提交。 */
export const WORKSPACE_GITIGNORE = '.mastery/\n.mastery-tmp-*\n';
/** Workspace 的 `.gitattributes`：掌握度投影冲突时由 merge driver 重算（3.7 注册）。 */
export const WORKSPACE_GITATTRIBUTES =
  'mastery/*.yaml merge=mastery-recompute\n';
/** `init` 创建的空目录。其余目录在第一次用到时由 store 创建。 */
export const WORKSPACE_DIRECTORIES = ['concepts', 'notes'] as const;
/** `init` 创建的文件，`workspace.yaml` 最后写。 */
const INIT_FILES = ['.gitignore', '.gitattributes', 'workspace.yaml'] as const;

/** `init` 的选项。 */
export interface InitOptions {
  readonly dir: string;
  readonly id: string | undefined;
  readonly name: string | undefined;
  readonly remote: string | undefined;
}

/**
 * 目标目录的状态：
 * - `fresh`：不存在或者是空的；
 * - `resume`：只有 `init` 自己会创建的东西（上次运行中途崩溃留下的），`workspace.yaml` 不存在或 id 一致；
 * - 其他情况报错（以后用 `--adopt` 支持接管已有的目录，见 ROADMAP“待整理”）。
 */
async function folderState(
  root: string,
  id: string,
): Promise<'fresh' | 'resume'> {
  if (!isDirectory(root)) return 'fresh';
  const names = await readdir(root);
  if (names.length === 0) return 'fresh';
  const allowed = new Set<string>([...INIT_FILES, ...WORKSPACE_DIRECTORIES]);
  const unexpected = names.filter((name) => !allowed.has(name));
  for (const dir of WORKSPACE_DIRECTORIES) {
    if (
      names.includes(dir) &&
      (!isDirectory(join(root, dir)) ||
        (await readdir(join(root, dir))).length > 0)
    ) {
      unexpected.push(`${dir}/`);
    }
  }
  if (unexpected.length > 0) {
    throw new CommandError(
      `${root} is not empty (${unexpected.slice(0, 3).join(', ')}${unexpected.length > 3 ? ', …' : ''}); ` +
        'mastery init only creates new workspaces. Adopting an existing folder is not supported yet.',
    );
  }
  if (names.includes('workspace.yaml')) {
    const fs = await NodeFileSystem.open(root);
    const parsed = parseYaml(await fs.readTextFile('workspace.yaml'));
    const existing = parsed.ok ? validate(WorkspaceConfig, parsed.data) : null;
    if (existing?.success !== true || existing.data.id !== id) {
      throw new CommandError(
        `${root} already has a workspace.yaml that is not for workspace "${id}"`,
      );
    }
  }
  return 'resume';
}

/**
 * `mastery init <dir>`：创建一个 Workspace，注册到当前 Profile，并写入 device.yaml。
 *
 * 步骤：检查全部前提 → 写文件（`workspace.yaml` 最后）→ 注册到 Profile → 写 device.yaml 的条目。
 * **可以重跑**：上次中途崩溃时，再运行一次会补上缺少的步骤，已经写好的文件不会被覆盖。
 */
export async function initCommand(
  context: CliContext,
  options: InitOptions,
): Promise<ExitCode> {
  const root = resolveUserPath(options.dir, context);
  const id = options.id ?? basename(root);
  if (!Slug.safeParse(id).success) {
    throw new CommandError(
      `"${id}" is not a valid workspace id (lowercase letters, digits and single hyphens); pass one with --id`,
      EXIT.usage,
    );
  }
  const env = await loadEnvironment(context);
  const state = await folderState(root, id);
  const path = canonicalPath(root, context.home);

  // 检查 Profile 和 device.yaml：重跑时允许已经完成的步骤。
  const workspaces = await env.profile.listWorkspaces();
  if (!workspaces.ok)
    throw new CommandError(describeProfileError(workspaces.error));
  const registered = workspaces.value.find((w) => w.id === id);
  if (registered !== undefined && state === 'fresh') {
    throw new CommandError(
      `workspace "${id}" is already registered in the profile; choose another --id`,
    );
  }
  const deviceEntry = (
    env.device.config.workspaces as Record<string, { path: string } | undefined>
  )[id];
  if (deviceEntry !== undefined && deviceEntry.path !== path) {
    throw new CommandError(
      `device.yaml already has workspace "${id}" at ${deviceEntry.path}`,
    );
  }

  const name = options.name ?? registered?.name ?? id;
  const workspace = validate(WorkspaceConfig, {
    schema_version: 1,
    id,
    name,
    plugins: {},
  });
  if (!workspace.success)
    throw new CommandError(workspace.issues.map((i) => i.message).join('\n'));
  // 远程地址等在写任何文件之前先校验。
  const registration = validate(WorkspaceRegistry, {
    schema_version: 1,
    workspaces: [
      { id, name, remote: options.remote ?? registered?.remote ?? null },
    ],
  });
  const entry = registration.success
    ? registration.data.workspaces[0]
    : undefined;
  if (entry === undefined) {
    throw new CommandError(
      registration.success
        ? 'invalid workspace'
        : registration.issues.map((i) => `--remote: ${i.message}`).join('\n'),
    );
  }

  // 1. 文件：只创建缺少的，从不覆盖。
  await mkdir(root, { recursive: true });
  for (const dir of WORKSPACE_DIRECTORIES)
    await mkdir(join(root, dir), { recursive: true });
  const fs = await NodeFileSystem.open(root);
  const contents: Record<string, string> = {
    '.gitignore': WORKSPACE_GITIGNORE,
    '.gitattributes': WORKSPACE_GITATTRIBUTES,
  };
  for (const file of ['.gitignore', '.gitattributes']) {
    try {
      await fs.createTextFile(file, contents[file] ?? '');
    } catch (error) {
      if (!isPlatformError(error, 'platform.already_exists')) throw error;
    }
  }
  if ((await fs.stat('workspace.yaml')) === null) {
    const saved = await createStore(fs).workspace.save(workspace.data);
    if (!saved.ok)
      throw new CommandError(saved.issues.map((i) => i.message).join('\n'));
  }
  context.hooks?.afterInitStep?.('files');

  // 2. 注册到 Profile。
  if (registered === undefined) {
    const result = await env.profile.registerWorkspace(entry);
    if (!result.ok) throw new CommandError(describeProfileError(result.error));
  }
  context.hooks?.afterInitStep?.('registered');

  // 3. device.yaml 的条目（重新读取，避免覆盖别的修改）。
  if (deviceEntry === undefined) {
    const latest = await loadDevice(env.deviceFs);
    if (latest === null || !latest.ok) {
      throw new CommandError(
        latest === null
          ? 'device.yaml disappeared'
          : describeDeviceError(latest.error),
      );
    }
    const config = latest.value.config;
    const saved = await saveDevice(
      env.deviceFs,
      {
        ...config,
        workspaces: {
          ...config.workspaces,
          [id]: { path, sync: 'auto', checkout: 'full' },
        },
      },
      { base: latest.value.snapshot },
    );
    if (!saved.ok) throw new CommandError(describeDeviceError(saved.error));
  }

  const updated = await loadDevice(env.deviceFs);
  if (updated?.ok === true) {
    for (const issue of checkDeviceLocation(
      context.deviceDir,
      updated.value.config,
      context.home,
    )) {
      context.stderr.write(`warning: ${issue.message}\n`);
    }
  }
  warnIfDeviceDirInGitTree(context);
  context.stdout.write(
    `${state === 'resume' ? 'Finished setting up' : 'Created'} workspace "${id}" in ${path} and registered it in the profile.\n`,
  );
  context.stdout.write(`Next: cd ${root} && git init\n`);
  return EXIT.ok;
}
