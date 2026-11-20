// 1.11：workspace.yaml 会提交到 Git、跟着仓库分享，插件配置里同样不能有密钥。
import { describe, expect, it } from 'vitest';

import { WorkspaceConfig } from './index.js';
import { codesOf, issuesOf } from './test-helpers.js';

const withPlugins = (plugins: unknown) => ({
  schema_version: 1,
  id: 'ai',
  name: 'AI',
  plugins,
});

describe('WorkspaceConfig: no secrets in plugin configs', () => {
  it('rejects secret keys at any depth', () => {
    expect(
      issuesOf(
        WorkspaceConfig,
        withPlugins({
          'provider-openai': { api_key: 'x' },
          'agent-x': { nested: { password: 'x' } },
        }),
      ),
    ).toEqual([
      ['plugins.provider-openai.api_key', 'secret.field_not_allowed'],
      ['plugins.agent-x.nested.password', 'secret.field_not_allowed'],
    ]);
  });

  it('rejects values in well-known token formats', () => {
    expect(
      codesOf(
        WorkspaceConfig,
        withPlugins({
          'agent-x': {
            header: 'Bearer ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8',
          },
        }),
      ),
    ).toEqual(['secret.value_not_allowed']);
  });

  it('still allows ordinary settings such as max_tokens', () => {
    expect(
      codesOf(
        WorkspaceConfig,
        withPlugins({
          'agent-evaluator': { max_tokens: 2048, model: 'ollama:qwen3-14b' },
        }),
      ),
    ).toEqual([]);
  });
});
