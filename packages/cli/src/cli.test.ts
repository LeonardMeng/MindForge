import { spawnSync } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { openProfileStore } from './commands/profile.js';
import {
  defaultLanguage,
  run,
  type CliContext,
  type InitStep,
} from './index.js';

const FIXTURE = join(import.meta.dirname, '../../../fixtures/ws-transformers');
const created: string[] = [];

afterAll(async () => {
  await Promise.all(
    created.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

/** 一个临时的 home 目录，以及在里面运行 `mastery` 的函数。 */
async function sandbox(hooks?: CliContext['hooks']) {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'mastery-cli-')));
  created.push(home);
  const mastery = async (...argv: string[]) => {
    let stdout = '';
    let stderr = '';
    const code = await run(argv, {
      home,
      deviceDir: join(home, '.mastery'),
      cwd: home,
      stdout: { write: (text) => (stdout += text) },
      stderr: { write: (text) => (stderr += text) },
      hostname: 'test-laptop',
      username: 'tester',
      locale: 'zh-CN',
      platform: process.platform,
      ...(hooks === undefined ? {} : { hooks }),
    });
    return { code, stdout, stderr };
  };
  return { home, mastery };
}

/** 所有文件（相对路径 → 内容），用来比较“没有被改过”。 */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(dir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    result[
      path
        .slice(dir.length + 1)
        .split('\\')
        .join('/')
    ] = await readFile(path, 'utf8');
  }
  return result;
}

const json = <T>(text: string) => JSON.parse(text) as T;

describe('profile init → init → validate', () => {
  it('works end to end, and profile show reports the workspace on this device', async () => {
    const { home, mastery } = await sandbox();
    const profile = await mastery(
      'profile',
      'init',
      '--name',
      'Parker',
      '--weekly-minutes',
      '300',
    );
    expect(profile).toMatchObject({ code: 0 });
    expect(profile.stdout).toContain('Next: cd ');
    expect(
      await readFile(join(home, 'MasteryProfile', '.gitignore'), 'utf8'),
    ).toBe('.mastery/\n.mastery-tmp-*\n');
    expect(await readFile(join(home, '.mastery', '.gitignore'), 'utf8')).toBe(
      '*\n',
    );
    const device = await readFile(
      join(home, '.mastery', 'device.yaml'),
      'utf8',
    );
    expect(device).toContain('path: ~/MasteryProfile');
    expect(device).toContain('name: test-laptop');

    const init = await mastery(
      'init',
      'Mastery/ai',
      '--name',
      'AI',
      '--remote',
      'git@github.com:me/ai.git',
    );
    expect(init).toMatchObject({ code: 0 });
    expect(init.stdout).toContain('Next: cd ');
    const ws = join(home, 'Mastery', 'ai');
    expect(await readFile(join(ws, 'workspace.yaml'), 'utf8')).toBe(
      'schema_version: 1\nid: ai\nname: AI\nplugins: {}\n',
    );
    expect(await readFile(join(ws, '.gitignore'), 'utf8')).toBe(
      '.mastery/\n.mastery-tmp-*\n',
    );
    expect(await readFile(join(ws, '.gitattributes'), 'utf8')).toBe(
      'mastery/*.yaml merge=mastery-recompute\n',
    );
    expect((await readdir(ws)).sort()).toEqual([
      '.gitattributes',
      '.gitignore',
      'concepts',
      'notes',
      'workspace.yaml',
    ]);

    expect(await mastery('validate', 'Mastery/ai')).toMatchObject({
      code: 0,
      stdout: '0 errors, 0 warnings\n',
    });

    const show = await mastery('profile', 'show', '--json');
    expect(show.code).toBe(0);
    expect(
      json<{ profile: object; workspaces: object[] }>(show.stdout),
    ).toMatchObject({
      profile: {
        name: 'Parker',
        language: 'zh-CN',
        weekly_minutes: 300,
        path: '~/MasteryProfile',
      },
      workspaces: [
        { id: 'ai', name: 'AI', state: 'pulled', path: '~/Mastery/ai' },
      ],
    });
    expect((await mastery('profile', 'show')).stdout).toContain(
      'on this device',
    );
  });

  it('fails with a hint when there is no profile', async () => {
    const { home, mastery } = await sandbox();
    const result = await mastery('init', 'Mastery/ai');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('mastery profile init');
    await expect(readdir(join(home, 'Mastery'))).rejects.toThrow();
  });

  it('refuses a second profile on the same device', async () => {
    const { mastery } = await sandbox();
    expect((await mastery('profile', 'init')).code).toBe(0);
    const again = await mastery('profile', 'init', 'Other');
    expect(again.code).toBe(1);
    expect(again.stderr).toContain('already has a profile');
  });

  it('rebuilds device.yaml from an existing profile when it was lost', async () => {
    const { home, mastery } = await sandbox();
    await mastery('profile', 'init');
    await mastery('init', 'Mastery/ai');
    await rm(join(home, '.mastery', 'device.yaml'));
    const rebuilt = await mastery('profile', 'init');
    expect(rebuilt.code).toBe(0);
    expect(rebuilt.stdout).toContain('Using the existing profile');
    expect(rebuilt.stdout).toContain('ai');
    const show = json<{ workspaces: { state: string }[] }>(
      (await mastery('profile', 'show', '--json')).stdout,
    );
    expect(show.workspaces.map((w) => w.state)).toEqual(['not_configured']);
  });

  it('reports missing folders and workspaces no longer in the profile', async () => {
    const { home, mastery } = await sandbox();
    await mastery('profile', 'init');
    await mastery('init', 'Mastery/ai');
    await mastery('init', 'Mastery/math');
    await rm(join(home, 'Mastery', 'ai'), { recursive: true });
    const store = await openProfileStore(join(home, 'MasteryProfile'));
    const removed = await store.unregisterWorkspace('math');
    expect(removed.ok).toBe(true);
    const show = json<{ workspaces: { id: string; state: string }[] }>(
      (await mastery('profile', 'show', '--json')).stdout,
    );
    expect(show.workspaces.map((w) => [w.id, w.state])).toEqual([
      ['ai', 'missing'],
      ['math', 'unregistered_local'],
    ]);
  });
});

describe('init', () => {
  async function withProfile() {
    const box = await sandbox();
    expect((await box.mastery('profile', 'init')).code).toBe(0);
    return box;
  }

  it('refuses a folder that already has other files', async () => {
    const { home, mastery } = await withProfile();
    await mkdir(join(home, 'vault'));
    await writeFile(join(home, 'vault', 'note.md'), '# mine\n');
    const result = await mastery('init', 'vault');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('not empty');
    expect(await readdir(join(home, 'vault'))).toEqual(['note.md']);
  });

  it('refuses a workspace.yaml for another workspace', async () => {
    const { home, mastery } = await withProfile();
    await mkdir(join(home, 'ai'));
    await writeFile(
      join(home, 'ai', 'workspace.yaml'),
      'schema_version: 1\nid: other\nname: x\nplugins: {}\n',
    );
    expect((await mastery('init', 'ai')).code).toBe(1);
  });

  it('refuses an id that is already registered', async () => {
    const { mastery } = await withProfile();
    expect((await mastery('init', 'one', '--id', 'ai')).code).toBe(0);
    const again = await mastery('init', 'two', '--id', 'ai');
    expect(again.code).toBe(1);
    expect(again.stderr).toContain('already registered');
  });

  it('asks for --id when the folder name is not a valid id', async () => {
    const { mastery } = await withProfile();
    const result = await mastery('init', 'My Workspace');
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('--id');
  });

  it('refuses a remote that is a local path, before creating anything', async () => {
    const { home, mastery } = await withProfile();
    const result = await mastery(
      'init',
      'ai',
      '--remote',
      '/Volumes/USB/ai.git',
    );
    expect(result.code).toBe(1);
    await expect(readdir(join(home, 'ai'))).rejects.toThrow();
  });

  describe.each(['files', 'registered'] as const)(
    'a crash after the "%s" step',
    (step: InitStep) => {
      it('is completed by running init again, without touching the files already written', async () => {
        const crashing = await sandbox({
          afterInitStep: (current) => {
            if (current === step)
              throw new Error(`simulated crash after ${step}`);
          },
        });
        expect((await crashing.mastery('profile', 'init')).code).toBe(0);
        await expect(crashing.mastery('init', 'Mastery/ai')).rejects.toThrow(
          'simulated crash',
        );
        const ws = join(crashing.home, 'Mastery', 'ai');
        const before = await snapshot(ws);

        // 同一个 home，不带钩子再运行一次。
        const { home } = crashing;
        let stdout = '';
        const code = await run(['init', 'Mastery/ai'], {
          home,
          deviceDir: join(home, '.mastery'),
          cwd: home,
          stdout: { write: (t) => (stdout += t) },
          stderr: { write: () => undefined },
          hostname: 'test-laptop',
          username: 'tester',
          locale: 'en',
          platform: process.platform,
        });
        expect(code).toBe(0);
        expect(stdout).toContain('Finished setting up');
        expect(await snapshot(ws)).toEqual(before);
        const store = await openProfileStore(join(home, 'MasteryProfile'));
        const workspaces = await store.listWorkspaces();
        expect(workspaces.ok ? workspaces.value.map((w) => w.id) : []).toEqual([
          'ai',
        ]);
        expect(
          await readFile(join(home, '.mastery', 'device.yaml'), 'utf8'),
        ).toContain('path: ~/Mastery/ai');
      });
    },
  );
});

describe('validate', () => {
  it('passes on the fixture, without a profile', async () => {
    const { home, mastery } = await sandbox();
    const result = await mastery('validate', FIXTURE);
    expect(result).toMatchObject({ code: 0, stdout: '0 errors, 0 warnings\n' });
    await expect(readdir(join(home, '.mastery'))).rejects.toThrow();
  });

  it('reports a prerequisite cycle with its path', async () => {
    const { home, mastery } = await sandbox();
    const ws = join(home, 'ws');
    await cp(FIXTURE, ws, { recursive: true });
    const file = join(ws, 'concepts', 'matrix-multiplication.md');
    await writeFile(
      file,
      (await readFile(file, 'utf8')).replace(
        'prerequisites: []',
        'prerequisites: [embedding]',
      ),
    );
    const result = await mastery('validate', 'ws');
    expect(result.code).toBe(1);
    expect(result.stdout).toContain(
      'embedding → matrix-multiplication → embedding',
    );
    const report = json<{ errors: { code: string }[] }>(
      (await mastery('validate', 'ws', '--json')).stdout,
    );
    expect(report.errors.map((e) => e.code)).toEqual([
      'reference.prerequisite_cycle',
    ]);
  });

  it('reports a missing prerequisite and a folder that is not a workspace', async () => {
    const { home, mastery } = await sandbox();
    const ws = join(home, 'ws');
    await cp(FIXTURE, ws, { recursive: true });
    await rm(join(ws, 'concepts', 'probability.md'));
    const report = json<{ errors: { code: string; file: string }[] }>(
      (await mastery('validate', 'ws', '--json')).stdout,
    );
    expect(report.errors.map((e) => [e.code, e.file])).toEqual([
      ['reference.prerequisite_missing', 'concepts/layer-normalization.md'],
      ['reference.prerequisite_missing', 'concepts/softmax.md'],
    ]);
    await mkdir(join(home, 'empty'));
    const empty = json<{ errors: { code: string }[] }>(
      (await mastery('validate', 'empty', '--json')).stdout,
    );
    expect(empty.errors.map((e) => e.code)).toEqual([
      'validate.workspace_missing',
    ]);
  });
});

describe('usage', () => {
  it.each([
    [[], 2],
    [['--help'], 0],
    [['frobnicate'], 2],
    [['init'], 2],
    [['validate', 'a', 'b'], 2],
    [['validate', '.', '--color'], 2],
    [['profile', 'nope'], 2],
  ] as const)('%j exits with %d', async (argv, code) => {
    const { mastery } = await sandbox();
    expect((await mastery(...argv)).code).toBe(code);
  });

  it.each([
    ['zh_CN.UTF-8', 'zh-CN'],
    ['en-US', 'en-US'],
    ['zh-hans-cn', 'zh-Hans-CN'],
    ['C', 'en'],
    ['', 'en'],
  ])('turns the locale %j into the language %j', (locale, language) => {
    expect(defaultLanguage(locale)).toBe(language);
  });
});

describe('the real file system', () => {
  it('notices an edit to the profile made by another program', async () => {
    const { home, mastery } = await sandbox();
    await mastery('profile', 'init');
    const store = await openProfileStore(join(home, 'MasteryProfile'));
    const changes: string[] = [];
    const unwatch = store.watch((change) =>
      changes.push(`${change.document}:${change.source}`),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    const file = join(home, 'MasteryProfile', 'defaults.yaml');
    await writeFile(file, `${await readFile(file, 'utf8')}# edited by hand\n`);
    await vi.waitFor(() => expect(changes).toContain('defaults:external'), {
      timeout: 5000,
    });
    unwatch();
  });
});

const hasGit = spawnSync('git', ['--version']).status === 0;
const git = (cwd: string, ...args: string[]) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout;
};

describe.runIf(hasGit)('device.yaml never ends up in a commit', () => {
  it('even when the whole home folder is a Git repository (a dotfiles repo)', async () => {
    const { home, mastery } = await sandbox();
    git(home, 'init', '-q');
    const profile = await mastery('profile', 'init');
    expect(profile.stderr).toContain('inside a Git work tree');
    await mastery('init', 'Mastery/ai');
    // 崩溃留下的临时文件、运行时状态。
    await writeFile(join(home, 'MasteryProfile', '.mastery-tmp-01JD'), 'x');
    await writeFile(join(home, 'Mastery', 'ai', '.mastery-tmp-01JD'), 'x');
    await mkdir(join(home, 'Mastery', 'ai', '.mastery'), { recursive: true });
    await writeFile(join(home, 'Mastery', 'ai', '.mastery', 'index.db'), 'x');

    git(home, 'add', '-A');
    const tracked = git(home, 'ls-files').split('\n').filter(Boolean);
    expect(tracked.filter((path) => path.includes('.mastery'))).toEqual([]);
    expect(tracked).toContain('MasteryProfile/profile.yaml');
    expect(tracked).toContain('Mastery/ai/workspace.yaml');
  });

  it('in the profile and the workspace as their own repositories', async () => {
    const { home, mastery } = await sandbox();
    await mastery('profile', 'init');
    await mastery('init', 'Mastery/ai');
    for (const dir of [
      join(home, 'MasteryProfile'),
      join(home, 'Mastery', 'ai'),
    ]) {
      git(dir, 'init', '-q');
      await mkdir(join(dir, '.mastery', 'runtime', 'locks'), {
        recursive: true,
      });
      await writeFile(
        join(dir, '.mastery', 'runtime', 'locks', 'profile-write.lock'),
        'x',
      );
      await writeFile(join(dir, '.mastery-tmp-01JD'), 'x');
      git(dir, 'add', '-A');
      const tracked = git(dir, 'ls-files').split('\n').filter(Boolean);
      expect(tracked.filter((path) => path.includes('.mastery'))).toEqual([]);
    }
  });
});
