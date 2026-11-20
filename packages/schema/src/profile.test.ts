import { describe, expect, it } from 'vitest';

import {
  ConceptLinks,
  ProfileConfig,
  ProfileDefaults,
  WorkspaceRegistry,
} from './index.js';
import { codesOf, issuesOf } from './test-helpers.js';

const TOKEN = 'ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';

describe('ProfileConfig (profile.yaml)', () => {
  const PROFILE = {
    schema_version: 1,
    id: '01JD4A0Y3S8M2K7Q5N1V6B9C0D',
    name: 'Parker',
    language: 'zh-CN',
    weekly_minutes: 300,
  };

  it('accepts a profile', () => {
    expect(codesOf(ProfileConfig, PROFILE)).toEqual([]);
  });

  it('accepts weekly_minutes: null (not set), 0 and a whole week', () => {
    for (const weekly_minutes of [null, 0, 10080]) {
      expect(codesOf(ProfileConfig, { ...PROFILE, weekly_minutes })).toEqual(
        [],
      );
    }
  });

  it('requires every field, including weekly_minutes', () => {
    expect(issuesOf(ProfileConfig, { schema_version: 1 })).toEqual([
      ['id', 'field.required'],
      ['name', 'field.required'],
      ['language', 'field.required'],
      ['weekly_minutes', 'field.required'],
    ]);
  });

  it.each(['zh-CN', 'en', 'en-US', 'zh-Hans-CN', 'zh-Hant', 'es-419', 'fil'])(
    'accepts the language tag %j',
    (language) => {
      expect(codesOf(ProfileConfig, { ...PROFILE, language })).toEqual([]);
    },
  );

  it.each(['zh-cn', 'ZH-CN', 'zh_CN', 'zh-hans', 'english', 'e', ''])(
    'rejects the language tag %j (one canonical casing)',
    (language) => {
      expect(codesOf(ProfileConfig, { ...PROFILE, language })).toEqual([
        'profile.invalid_language',
      ]);
    },
  );

  it.each([
    [-1, 'field.out_of_range'],
    [10081, 'field.out_of_range'],
    [1.5, 'field.not_integer'],
  ])('rejects weekly_minutes %j', (weekly_minutes, code) => {
    expect(codesOf(ProfileConfig, { ...PROFILE, weekly_minutes })).toEqual([
      code,
    ]);
  });

  it('has no goals yet (7.4)', () => {
    expect(codesOf(ProfileConfig, { ...PROFILE, goals: [] })).toEqual([
      'field.unknown',
    ]);
  });
});

describe('WorkspaceRegistry (workspaces.yaml)', () => {
  /** README 第 7 节的示例。 */
  const README_EXAMPLE = {
    schema_version: 1,
    workspaces: [
      { id: 'ai', name: 'AI', remote: 'git@github.com:me/mastery-ai.git' },
      {
        id: 'math',
        name: '数学',
        remote: 'git@gitea.local:me/mastery-math.git',
      },
    ],
  };
  const withRemote = (remote: unknown) => ({
    schema_version: 1,
    workspaces: [{ id: 'ai', name: 'AI', remote }],
  });

  it('accepts the README example and an empty registry', () => {
    expect(codesOf(WorkspaceRegistry, README_EXAMPLE)).toEqual([]);
    expect(
      codesOf(WorkspaceRegistry, { schema_version: 1, workspaces: [] }),
    ).toEqual([]);
  });

  it('requires remote to be written out; null means no remote', () => {
    expect(codesOf(WorkspaceRegistry, withRemote(null))).toEqual([]);
    expect(
      issuesOf(WorkspaceRegistry, {
        schema_version: 1,
        workspaces: [{ id: 'ai', name: 'AI' }],
      }),
    ).toEqual([['workspaces.0.remote', 'field.required']]);
  });

  it('rejects two workspaces with the same id', () => {
    expect(
      issuesOf(WorkspaceRegistry, {
        schema_version: 1,
        workspaces: [
          { id: 'ai', name: 'AI', remote: null },
          { id: 'ai', name: 'AI 2', remote: null },
        ],
      }),
    ).toEqual([['workspaces.1.id', 'workspace_registry.duplicate_id']]);
  });

  it.each([
    'git@github.com:me/mastery-ai.git',
    'github.com:me/mastery-ai.git',
    'ssh://git@github.com/me/mastery-ai.git',
    'ssh://git@gitea.local:2222/me/math.git',
    'https://github.com/me/mastery-ai.git',
    'http://gitea.local:3000/me/math.git',
    'git://example.com/repo.git',
  ])('accepts the remote %j', (remote) => {
    expect(codesOf(WorkspaceRegistry, withRemote(remote))).toEqual([]);
  });

  it.each([
    '/Volumes/USB/mastery-ai.git',
    '~/repos/mastery-ai.git',
    './mastery-ai.git',
    '../mastery-ai.git',
    'C:\\repos\\mastery-ai.git',
    'C:/repos/mastery-ai.git',
    '\\\\nas\\share\\mastery-ai.git',
    'file:///srv/git/mastery-ai.git',
  ])('rejects the local path %j as a remote (remote.local_path)', (remote) => {
    expect(codesOf(WorkspaceRegistry, withRemote(remote))).toEqual([
      'remote.local_path',
    ]);
  });

  it('reports a token in the user name slot as a secret value', () => {
    expect(
      codesOf(
        WorkspaceRegistry,
        withRemote(`https://${TOKEN}@github.com/me/repo.git`),
      ),
    ).toEqual(['secret.value_not_allowed']);
  });

  it.each([
    'https://x-access@github.com/me/repo.git',
    'https://me@github.com/me/repo.git',
    'https://me:hunter2@github.com/me/repo.git',
    'http://oauth2:abc@gitea.local/me/repo.git',
    'ssh://git:hunter2@github.com/me/repo.git',
  ])(
    'rejects credentials in the URL %j (secret.credentials_in_url)',
    (remote) => {
      expect(codesOf(WorkspaceRegistry, withRemote(remote))).toEqual([
        'secret.credentials_in_url',
      ]);
    },
  );

  it.each([
    '',
    'not a url',
    'ftp://example.com/repo.git',
    'https://',
    'git@:path',
  ])('rejects the remote %j', (remote) => {
    expect(codesOf(WorkspaceRegistry, withRemote(remote))).not.toEqual([]);
  });
});

describe('ConceptLinks (concept-links.yaml)', () => {
  const link = (from: string, to: string) => ({
    from,
    relation: 'requires',
    to,
  });

  it('accepts cross-workspace links and an empty list', () => {
    expect(
      codesOf(ConceptLinks, {
        schema_version: 1,
        links: [
          link('ai:self-attention', 'math:matrix-multiplication'),
          link('ai:softmax', 'math:probability'),
        ],
      }),
    ).toEqual([]);
    expect(codesOf(ConceptLinks, { schema_version: 1, links: [] })).toEqual([]);
  });

  it('only knows the relation "requires" for now', () => {
    expect(
      issuesOf(ConceptLinks, {
        schema_version: 1,
        links: [{ from: 'ai:a', relation: 'related', to: 'math:b' }],
      }),
    ).toEqual([['links.0.relation', 'field.invalid_option']]);
  });

  it('rejects links inside one workspace (they belong in the concept frontmatter)', () => {
    expect(
      issuesOf(ConceptLinks, {
        schema_version: 1,
        links: [link('ai:self-attention', 'ai:softmax')],
      }),
    ).toEqual([['links.0', 'concept_link.same_workspace']]);
  });

  it('rejects a link from a concept to itself', () => {
    expect(
      issuesOf(ConceptLinks, {
        schema_version: 1,
        links: [link('ai:softmax', 'ai:softmax')],
      }),
    ).toEqual([['links.0', 'concept_link.self']]);
  });

  it('rejects the same link twice', () => {
    expect(
      issuesOf(ConceptLinks, {
        schema_version: 1,
        links: [
          link('ai:self-attention', 'math:matrix-multiplication'),
          link('ai:self-attention', 'math:matrix-multiplication'),
        ],
      }),
    ).toEqual([['links.1', 'concept_link.duplicate']]);
  });

  it('requires global references on both ends', () => {
    expect(
      codesOf(ConceptLinks, {
        schema_version: 1,
        links: [link('self-attention', 'math:matrix-multiplication')],
      }),
    ).toEqual(['global_concept_ref.invalid_format']);
  });
});

describe('ProfileDefaults (defaults.yaml)', () => {
  const DEFAULTS = {
    schema_version: 1,
    plugins: { 'agent-evaluator': { style: 'strict', max_tokens: 2048 } },
    model: 'ollama:qwen3-14b',
  };

  it('accepts defaults, and model: null', () => {
    expect(codesOf(ProfileDefaults, DEFAULTS)).toEqual([]);
    expect(codesOf(ProfileDefaults, { ...DEFAULTS, model: null })).toEqual([]);
  });

  it('uses the same plugin rules as workspace.yaml', () => {
    expect(
      codesOf(ProfileDefaults, {
        ...DEFAULTS,
        plugins: { 'agent-x': null, '~agent-x': {} },
      }),
    ).toEqual(['workspace.plugin_config_null', 'workspace.plugin_conflict']);
  });

  it('rejects secrets in plugin configs: keys and well-known token formats', () => {
    expect(
      issuesOf(ProfileDefaults, {
        ...DEFAULTS,
        plugins: {
          'provider-openai': { api_key: 'x' },
          'provider-github': { auth: TOKEN },
        },
      }),
    ).toEqual([
      ['plugins.provider-openai.api_key', 'secret.field_not_allowed'],
      ['plugins.provider-github.auth', 'secret.value_not_allowed'],
    ]);
  });
});
