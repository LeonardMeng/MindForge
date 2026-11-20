import { MemoryFileSystem } from '@mastery/platform-memory';
import { DeviceConfig, WorkspaceRegistry } from '@mastery/schema';
import { describe, expect, it } from 'vitest';

import {
  checkDeviceLocation,
  DEVICE_FILE,
  DEVICE_GITIGNORE,
  initDevice,
  loadDevice,
  regenerateDevice,
  saveDevice,
  workspaceStates,
  type DeviceResult,
  type NewDevice,
} from './index.js';

function idGenerator(): () => string {
  let counter = 0;
  return () => `01JD4A0Y3S${String(++counter).padStart(16, '0')}`;
}

const NEW_DEVICE = (): NewDevice => ({
  name: '工作笔记本',
  platform: 'macos',
  profilePath: '~/MasteryProfile',
  resourcesDir: '~/Mastery/_resources',
  generateId: idGenerator(),
});

const REGISTRY = WorkspaceRegistry.parse({
  schema_version: 1,
  workspaces: [
    { id: 'ai', name: 'AI', remote: 'git@github.com:me/mastery-ai.git' },
    { id: 'math', name: '数学', remote: null },
    { id: 'physics', name: '物理', remote: null },
  ],
});

/** README 第 7 节的例子：ai 和 math 在本机有位置，另外一个 history 已经从 Profile 注销。 */
const DEVICE = DeviceConfig.parse({
  schema_version: 1,
  device: {
    id: '01JD4A0Y3S8M2K7Q5N1V6B9C0D',
    name: '工作笔记本',
    platform: 'macos',
  },
  profile: { store: 'git', path: '~/MasteryProfile' },
  workspaces: {
    ai: { path: '~/Mastery/ai', sync: 'auto', checkout: 'full' },
    math: { path: '~/Mastery/math', sync: 'on-demand', checkout: 'text-only' },
    history: { path: '~/Mastery/history', sync: 'manual', checkout: 'full' },
  },
  sync: { on_metered_network: false, interval_minutes: 15 },
  storage: { resources_dir: '~/Mastery/_resources', max_cache_mb: 2048 },
  models: { local_runtime: 'ollama', local_endpoint: 'http://127.0.0.1:11434' },
});

function ok<T>(result: DeviceResult<T> | null): T {
  if (result === null) throw new Error('device.yaml not found');
  if (!result.ok)
    throw new Error(
      `${result.error.code}: ${JSON.stringify(result.error.issues)}`,
    );
  return result.value;
}

describe('workspaceStates: only what the two configs know', () => {
  it('reports configured, not_configured and unregistered_local', () => {
    expect(workspaceStates(DEVICE, REGISTRY)).toEqual([
      { id: 'ai', state: 'configured', name: 'AI', path: '~/Mastery/ai' },
      { id: 'math', state: 'configured', name: '数学', path: '~/Mastery/math' },
      { id: 'physics', state: 'not_configured', name: '物理', path: null },
      {
        id: 'history',
        state: 'unregistered_local',
        name: null,
        path: '~/Mastery/history',
      },
    ]);
  });

  it('does not treat sync: on-demand as "not on this machine"', () => {
    const states = workspaceStates(DEVICE, REGISTRY);
    expect(states.find((s) => s.id === 'math')?.state).toBe('configured');
  });

  it('reports every registered workspace as not_configured on a new device', () => {
    const fresh = DeviceConfig.parse({ ...DEVICE, workspaces: {} });
    expect(workspaceStates(fresh, REGISTRY).map((s) => s.state)).toEqual([
      'not_configured',
      'not_configured',
      'not_configured',
    ]);
  });
});

describe('initDevice: first run', () => {
  it('creates device.yaml with a new ULID and no workspaces, plus a .gitignore that ignores everything', async () => {
    const fs = new MemoryFileSystem();
    const created = ok(await initDevice(fs, NEW_DEVICE()));
    expect(created.config.device.id).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    expect(created.config.workspaces).toEqual({});
    expect(created.config.profile).toEqual({
      store: 'git',
      path: '~/MasteryProfile',
    });
    expect(await fs.readTextFile(DEVICE_GITIGNORE.path)).toBe('*\n');
    expect(ok(await loadDevice(fs)).config).toEqual(created.config);
  });

  it('leaves an existing .gitignore alone', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeTextFile('.gitignore', '# mine\ncache/\n');
    ok(await initDevice(fs, NEW_DEVICE()));
    expect(await fs.readTextFile('.gitignore')).toBe('# mine\ncache/\n');
  });

  it('refuses to replace an existing device.yaml', async () => {
    const fs = new MemoryFileSystem();
    const first = ok(await initDevice(fs, NEW_DEVICE()));
    const again = await initDevice(fs, { ...NEW_DEVICE(), name: 'other' });
    expect(again.ok ? '' : again.error.code).toBe('device.already_exists');
    expect(ok(await loadDevice(fs)).config.device.id).toBe(
      first.config.device.id,
    );
  });

  it('refuses a malformed id instead of writing it', async () => {
    const fs = new MemoryFileSystem();
    const result = await initDevice(fs, {
      ...NEW_DEVICE(),
      generateId: () => 'not-a-ulid',
    });
    expect(result.ok ? '' : result.error.code).toBe('device.invalid');
    expect(await fs.stat(DEVICE_FILE)).toBeNull();
  });
});

describe('regenerateDevice: device.yaml was lost', () => {
  it('builds a new device from the profile, without workspaces, and lists the ones to confirm', async () => {
    const fs = new MemoryFileSystem();
    const regenerated = ok(await regenerateDevice(fs, REGISTRY, NEW_DEVICE()));
    expect(regenerated.config.workspaces).toEqual({});
    expect(regenerated.toConfirm.map((w) => w.id)).toEqual([
      'ai',
      'math',
      'physics',
    ]);
    expect(
      workspaceStates(regenerated.config, REGISTRY).map((s) => s.state),
    ).toEqual(['not_configured', 'not_configured', 'not_configured']);
    expect(await fs.readTextFile('.gitignore')).toBe('*\n');
  });

  it('refuses when device.yaml still exists', async () => {
    const fs = new MemoryFileSystem();
    ok(await initDevice(fs, NEW_DEVICE()));
    const result = await regenerateDevice(fs, REGISTRY, NEW_DEVICE());
    expect(result.ok ? '' : result.error.code).toBe('device.already_exists');
  });
});

describe('loadDevice and saveDevice', () => {
  it('returns null when there is no device.yaml', async () => {
    expect(await loadDevice(new MemoryFileSystem())).toBeNull();
  });

  it('saves changes with the snapshot it read, keeping comments', async () => {
    const fs = new MemoryFileSystem();
    ok(await initDevice(fs, NEW_DEVICE()));
    const commented = `# 这台设备的配置\n${await fs.readTextFile(DEVICE_FILE)}`;
    await fs.writeTextFile(DEVICE_FILE, commented);
    const loaded = ok(await loadDevice(fs));
    ok(
      await saveDevice(
        fs,
        {
          ...loaded.config,
          device: { ...loaded.config.device, name: '家里的台式机' },
        },
        { base: loaded.snapshot },
      ),
    );
    expect(await fs.readTextFile(DEVICE_FILE)).toBe(
      commented.replace('name: 工作笔记本', 'name: 家里的台式机'),
    );
  });

  it('refuses to overwrite a change made since the read', async () => {
    const fs = new MemoryFileSystem();
    ok(await initDevice(fs, NEW_DEVICE()));
    const loaded = ok(await loadDevice(fs));
    await fs.writeTextFile(
      DEVICE_FILE,
      `${await fs.readTextFile(DEVICE_FILE)}# edited\n`,
    );
    const result = await saveDevice(fs, loaded.config, {
      base: loaded.snapshot,
    });
    expect(result.ok ? '' : result.error.code).toBe(
      'device.modified_since_read',
    );
  });

  it('reports a file that does not validate, with its issues', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeTextFile(DEVICE_FILE, 'schema_version: 1\napi_key: x\n');
    const result = await loadDevice(fs);
    expect(
      result?.ok === false
        ? [result.error.code, result.error.issues.map((i) => i.code)]
        : [],
    ).toEqual(['device.invalid', ['secret.field_not_allowed']]);
  });

  it('reports a file from a newer version', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeTextFile(DEVICE_FILE, 'schema_version: 7\n');
    const result = await loadDevice(fs);
    expect(result?.ok === false ? result.error.code : '').toBe(
      'device.version_too_new',
    );
  });

  describe('profile.store: cloud is refused until 9.7', () => {
    const cloud = DeviceConfig.parse({
      ...DEVICE,
      profile: {
        store: 'cloud',
        endpoint: 'https://profile.example.com',
        cache_path: '~/.mastery/profile-cache',
      },
    });

    it('when loading', async () => {
      const fs = new MemoryFileSystem();
      await fs.writeTextFile(
        DEVICE_FILE,
        [
          'schema_version: 1',
          'device: { id: 01JD4A0Y3S8M2K7Q5N1V6B9C0D, name: x, platform: linux }',
          'profile: { store: cloud, endpoint: "https://profile.example.com", cache_path: ~/.mastery/cache }',
          'workspaces: {}',
          'sync: { on_metered_network: false, interval_minutes: 15 }',
          'storage: { resources_dir: ~/r, max_cache_mb: 0 }',
          'models: { local_runtime: null, local_endpoint: null }',
          '',
        ].join('\n'),
      );
      const result = await loadDevice(fs);
      expect(result?.ok === false ? result.error.code : '').toBe(
        'device.cloud_profile_unsupported',
      );
    });

    it('when saving', async () => {
      const fs = new MemoryFileSystem();
      const result = await saveDevice(fs, cloud);
      expect(result.ok ? '' : result.error.code).toBe(
        'device.cloud_profile_unsupported',
      );
      expect(await fs.stat(DEVICE_FILE)).toBeNull();
    });
  });
});

describe('checkDeviceLocation', () => {
  const HOME = '/Users/me';
  const withPaths = (profilePath: string, workspaces: Record<string, string>) =>
    DeviceConfig.parse({
      ...DEVICE,
      profile: { store: 'git', path: profilePath },
      workspaces: Object.fromEntries(
        Object.entries(workspaces).map(([id, path]) => [
          id,
          { path, sync: 'auto', checkout: 'full' },
        ]),
      ),
    });

  it('finds nothing when the device folder is outside every repository', () => {
    expect(checkDeviceLocation('~/.mastery', DEVICE, HOME)).toEqual([]);
  });

  it('reports a workspace or the profile that contains the device folder', () => {
    const issues = checkDeviceLocation(
      '/Users/me/.mastery',
      withPaths('~', {
        home: '~/',
        ai: '~/Mastery/ai',
        dot: '/Users/me/.mastery',
      }),
      HOME,
    );
    expect(issues.map((i) => [i.code, i.owner, i.id])).toEqual([
      ['device.inside_repository', 'profile', null],
      ['device.inside_repository', 'workspace', 'dot'],
      ['device.inside_repository', 'workspace', 'home'],
    ]);
  });

  it('does not confuse a sibling folder that starts with the same name', () => {
    expect(
      checkDeviceLocation('~/.mastery', withPaths('~/.mast', {}), HOME),
    ).toEqual([]);
  });

  it('compares Windows paths without regard to case or separators', () => {
    const issues = checkDeviceLocation(
      'C:\\Users\\Me\\.mastery',
      withPaths('c:/users/me', {}),
      'C:\\Users\\Me',
    );
    expect(issues.map((i) => i.owner)).toEqual(['profile']);
  });
});
