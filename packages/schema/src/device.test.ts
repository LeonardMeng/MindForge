import { describe, expect, it } from 'vitest';

import { DeviceConfig } from './index.js';
import { codesOf, issuesOf } from './test-helpers.js';

/** README 第 7 节的 device.yaml 示例（加上了 1.11 要求的 `checkout: full`）。 */
const README_EXAMPLE = {
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
  },
  sync: { on_metered_network: false, interval_minutes: 15 },
  storage: { resources_dir: '~/Mastery/_resources', max_cache_mb: 2048 },
  models: {
    local_runtime: 'ollama',
    local_endpoint: 'http://127.0.0.1:11434',
  },
};

type Example = typeof README_EXAMPLE;
const change = (patch: (example: Example) => unknown) =>
  patch(JSON.parse(JSON.stringify(README_EXAMPLE)) as Example);

describe('DeviceConfig (device.yaml)', () => {
  it('accepts the README example', () => {
    expect(codesOf(DeviceConfig, README_EXAMPLE)).toEqual([]);
  });

  it('requires every top-level section', () => {
    expect(issuesOf(DeviceConfig, { schema_version: 1 })).toEqual([
      ['device', 'field.required'],
      ['profile', 'field.required'],
      ['workspaces', 'field.required'],
      ['sync', 'field.required'],
      ['storage', 'field.required'],
      ['models', 'field.required'],
    ]);
  });

  it('accepts every platform and rejects others', () => {
    for (const platform of ['macos', 'windows', 'linux', 'ios', 'android']) {
      expect(
        codesOf(
          DeviceConfig,
          change((e) => ({ ...e, device: { ...e.device, platform } })),
        ),
      ).toEqual([]);
    }
    expect(
      issuesOf(
        DeviceConfig,
        change((e) => ({ ...e, device: { ...e.device, platform: 'freebsd' } })),
      ),
    ).toEqual([['device.platform', 'field.invalid_option']]);
  });

  describe('profile', () => {
    it('accepts the cloud store with an endpoint and a local copy (refused by 1.14 until 9.7)', () => {
      expect(
        codesOf(
          DeviceConfig,
          change((e) => ({
            ...e,
            profile: {
              store: 'cloud',
              endpoint: 'https://profile.example.com',
              cache_path: '~/.mastery/profile-cache',
            },
          })),
        ),
      ).toEqual([]);
    });

    it('requires the fields of the chosen store, and only those', () => {
      expect(
        issuesOf(
          DeviceConfig,
          change((e) => ({ ...e, profile: { store: 'cloud', path: '~/p' } })),
        ),
      ).toEqual([
        ['profile.endpoint', 'field.required'],
        ['profile.cache_path', 'field.required'],
        ['profile.path', 'field.unknown'],
      ]);
      expect(
        issuesOf(
          DeviceConfig,
          change((e) => ({ ...e, profile: { store: 'dropbox' } })),
        ),
      ).toEqual([['profile.store', 'field.invalid_option']]);
    });
  });

  describe('workspaces', () => {
    it('requires checkout (one way to write "full")', () => {
      expect(
        issuesOf(
          DeviceConfig,
          change((e) => ({
            ...e,
            workspaces: { ai: { path: '~/Mastery/ai', sync: 'auto' } },
          })),
        ),
      ).toEqual([['workspaces.ai.checkout', 'field.required']]);
    });

    it('accepts no workspaces', () => {
      expect(
        codesOf(
          DeviceConfig,
          change((e) => ({ ...e, workspaces: {} })),
        ),
      ).toEqual([]);
    });

    it('keys are workspace slugs', () => {
      expect(
        codesOf(
          DeviceConfig,
          change((e) => ({
            ...e,
            workspaces: { 'Not A Slug': e.workspaces.ai },
          })),
        ),
      ).toEqual(['slug.invalid_format']);
    });

    it.each([
      ['sync', 'always'],
      ['checkout', 'partial'],
    ])('rejects %s: %j', (field, value) => {
      expect(
        issuesOf(
          DeviceConfig,
          change((e) => ({
            ...e,
            workspaces: { ai: { ...e.workspaces.ai, [field]: value } },
          })),
        ),
      ).toEqual([[`workspaces.ai.${field}`, 'field.invalid_option']]);
    });
  });

  describe('local paths', () => {
    it.each([
      '/home/me/Mastery/ai',
      '~',
      '~/Mastery/ai',
      'C:\\Users\\me\\Mastery',
      'D:/Mastery',
      '\\\\nas\\share\\Mastery',
    ])('accepts the absolute path %j', (path) => {
      expect(
        codesOf(
          DeviceConfig,
          change((e) => ({
            ...e,
            workspaces: { ai: { ...e.workspaces.ai, path } },
          })),
        ),
      ).toEqual([]);
    });

    it.each(['Mastery/ai', './ai', '../ai', '~me/ai', 'C:Mastery'])(
      'rejects the relative path %j',
      (path) => {
        expect(
          codesOf(
            DeviceConfig,
            change((e) => ({
              ...e,
              storage: { ...e.storage, resources_dir: path },
            })),
          ),
        ).toEqual(['local_path.not_absolute']);
      },
    );
  });

  describe('sync and storage', () => {
    it.each([
      [0, 'field.out_of_range'],
      [1441, 'field.out_of_range'],
      [2.5, 'field.not_integer'],
    ])('rejects interval_minutes %j', (interval_minutes, code) => {
      expect(
        codesOf(
          DeviceConfig,
          change((e) => ({ ...e, sync: { ...e.sync, interval_minutes } })),
        ),
      ).toEqual([code]);
    });

    it('accepts max_cache_mb: 0 and rejects negative sizes', () => {
      expect(
        codesOf(
          DeviceConfig,
          change((e) => ({ ...e, storage: { ...e.storage, max_cache_mb: 0 } })),
        ),
      ).toEqual([]);
      expect(
        codesOf(
          DeviceConfig,
          change((e) => ({
            ...e,
            storage: { ...e.storage, max_cache_mb: -1 },
          })),
        ),
      ).toEqual(['field.out_of_range']);
    });
  });

  describe('models', () => {
    it('accepts no local runtime (both null)', () => {
      expect(
        codesOf(
          DeviceConfig,
          change((e) => ({
            ...e,
            models: { local_runtime: null, local_endpoint: null },
          })),
        ),
      ).toEqual([]);
    });

    it('requires both or neither (device.models_incomplete)', () => {
      expect(
        issuesOf(
          DeviceConfig,
          change((e) => ({
            ...e,
            models: { local_runtime: 'ollama', local_endpoint: null },
          })),
        ),
      ).toEqual([['models', 'device.models_incomplete']]);
    });

    it('accepts any runtime slug, not a fixed list', () => {
      expect(
        codesOf(
          DeviceConfig,
          change((e) => ({
            ...e,
            models: { ...e.models, local_runtime: 'llama-cpp' },
          })),
        ),
      ).toEqual([]);
    });

    it.each(['127.0.0.1:11434', 'ftp://127.0.0.1', 'http://', 'localhost'])(
      'rejects the endpoint %j',
      (local_endpoint) => {
        expect(
          codesOf(
            DeviceConfig,
            change((e) => ({ ...e, models: { ...e.models, local_endpoint } })),
          ),
        ).toEqual(['endpoint.invalid']);
      },
    );
  });

  describe('no secrets (invariant 13)', () => {
    it.each([
      'api_key',
      'token',
      'password',
      'secret',
      'apiKey',
      'client_secret',
      'credentials',
    ])(
      'rejects a %j field anywhere, instead of reporting an unknown field',
      (key) => {
        expect(
          issuesOf(
            DeviceConfig,
            change((e) => ({ ...e, models: { ...e.models, [key]: 'x' } })),
          ),
        ).toEqual([[`models.${key}`, 'secret.field_not_allowed']]);
        expect(
          issuesOf(
            DeviceConfig,
            change((e) => ({ ...e, [key]: 'x' })),
          ),
        ).toEqual([[key, 'secret.field_not_allowed']]);
      },
    );

    it('rejects a value that looks like a token, even in a known field', () => {
      expect(
        issuesOf(
          DeviceConfig,
          change((e) => ({
            ...e,
            device: { ...e.device, name: 'sk-ant-api03-A1b2C3d4E5f6G7h8I9j0' },
          })),
        ),
      ).toEqual([['device.name', 'secret.value_not_allowed']]);
    });

    it('rejects credentials in an endpoint URL', () => {
      expect(
        codesOf(
          DeviceConfig,
          change((e) => ({
            ...e,
            profile: {
              store: 'cloud',
              endpoint: 'https://me:hunter2@profile.example.com',
              cache_path: '~/.mastery/profile-cache',
            },
          })),
        ),
      ).toEqual(['secret.credentials_in_url']);
    });

    it('says what to do in the message: use the keychain, or rename an innocent key', () => {
      const result = DeviceConfig.safeParse(
        change((e) => ({ ...e, token_limit: 5 })),
      );
      const message = result.success
        ? ''
        : (result.error.issues[0]?.message ?? '');
      expect(message).toContain('keychain');
      expect(message).toContain('rename');
    });
  });
});
