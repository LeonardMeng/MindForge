import { describe, expect, it } from 'vitest';

import { WorkspaceConfig } from './index.js';
import { codesOf, issuesOf } from './test-helpers.js';

/** README 第 4 节的 plugins 示例，加上必填字段。 */
const README_EXAMPLE = {
  schema_version: 1,
  id: 'ai',
  name: 'AI',
  plugins: {
    'agent-teacher': { style: 'socratic' },
    'agent-evaluator': { model: 'cloud:anthropic' },
    '~agent-research': {},
  },
};

const withPlugins = (plugins: unknown) => ({ ...README_EXAMPLE, plugins });

describe('WorkspaceConfig', () => {
  it('accepts the README example', () => {
    expect(codesOf(WorkspaceConfig, README_EXAMPLE)).toEqual([]);
  });

  it('accepts an optional description and no plugins', () => {
    expect(
      codesOf(WorkspaceConfig, {
        schema_version: 1,
        id: 'math',
        name: '数学',
        description: '线性代数和概率',
        plugins: {},
      }),
    ).toEqual([]);
  });

  it('keeps plugin config objects as they are (each plugin validates its own config)', () => {
    const config = WorkspaceConfig.parse(
      withPlugins({
        'agent-teacher': { style: 'socratic', nested: { a: [1, 2] } },
      }),
    );
    expect(config.plugins['agent-teacher']).toEqual({
      style: 'socratic',
      nested: { a: [1, 2] },
    });
  });

  it.each(['schema_version', 'id', 'name', 'plugins'])(
    'requires %s',
    (field) => {
      const input: Record<string, unknown> = { ...README_EXAMPLE };
      delete input[field];
      expect(issuesOf(WorkspaceConfig, input)).toEqual([
        [field, 'field.required'],
      ]);
    },
  );

  it('only accepts schema_version 1', () => {
    expect(
      issuesOf(WorkspaceConfig, { ...README_EXAMPLE, schema_version: 2 }),
    ).toEqual([['schema_version', 'field.invalid_option']]);
  });

  it('rejects an invalid workspace id', () => {
    expect(
      issuesOf(WorkspaceConfig, { ...README_EXAMPLE, id: 'My AI' }),
    ).toEqual([['id', 'slug.invalid_format']]);
  });

  it.each(['', '   '])('rejects an empty name %j', (name) => {
    expect(issuesOf(WorkspaceConfig, { ...README_EXAMPLE, name })).toEqual([
      ['name', 'field.empty'],
    ]);
  });

  it('rejects unknown top-level fields, including a separate superagent field', () => {
    expect(
      issuesOf(WorkspaceConfig, { ...README_EXAMPLE, superagent: 'default' }),
    ).toEqual([['superagent', 'field.unknown']]);
  });

  describe('plugins', () => {
    it('rejects null as a plugin config (write {} instead)', () => {
      expect(
        issuesOf(WorkspaceConfig, withPlugins({ 'agent-teacher': null })),
      ).toEqual([['plugins.agent-teacher', 'workspace.plugin_config_null']]);
    });

    it.each([[[]], ['socratic'], [1]])(
      'rejects %j as a plugin config',
      (value) => {
        expect(
          issuesOf(WorkspaceConfig, withPlugins({ 'agent-teacher': value })),
        ).toEqual([['plugins.agent-teacher', 'field.invalid_type']]);
      },
    );

    it.each([
      'Agent-Teacher',
      'agent_teacher',
      '~',
      '~~agent-x',
      '@someone/agent-x',
      '',
    ])('rejects the plugin name %j', (name) => {
      expect(issuesOf(WorkspaceConfig, withPlugins({ [name]: {} }))).toEqual([
        [`plugins.${name}`, 'workspace.invalid_plugin_name'],
      ]);
    });

    it('rejects a plugin that is both enabled and disabled', () => {
      expect(
        issuesOf(
          WorkspaceConfig,
          withPlugins({ 'agent-x': {}, '~agent-x': {} }),
        ),
      ).toEqual([['plugins.~agent-x', 'workspace.plugin_conflict']]);
    });

    it('rejects plugins that is not an object', () => {
      expect(issuesOf(WorkspaceConfig, withPlugins(['agent-teacher']))).toEqual(
        [['plugins', 'field.invalid_type']],
      );
    });
  });
});
