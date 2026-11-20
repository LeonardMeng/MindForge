// .dependency-cruiser.js 的规则本身的测试：在 fixtures/dependency-rules 这个小仓库上运行规则，
// 检查该拒绝的被拒绝、该允许的被允许。
import { cruise, type IViolation } from 'dependency-cruiser';
import { describe, expect, it } from 'vitest';

import config from '../.dependency-cruiser.js';

/** 在 fixtures/<fixture> 这个样例仓库上运行规则。 */
async function violations(fixture: string): Promise<IViolation[]> {
  const result = await cruise(['packages'], {
    ...config.options,
    baseDir: `${import.meta.dirname}/fixtures/${fixture}`,
    validate: true,
    ruleSet: { forbidden: config.forbidden },
  });
  if (typeof result.output === 'string') throw new Error('unexpected output');
  return result.output.summary.violations;
}

describe('dependency rules', () => {
  it('lets only test files import platform-memory', async () => {
    const found = (await violations('dependency-rules')).map((v) => ({
      rule: v.rule.name,
      from: v.from,
      to: v.to,
    }));
    expect(found).toEqual([
      {
        rule: 'platform-memory-only-in-tests',
        from: 'packages/store/src/uses-memory.ts',
        to: 'packages/platform-memory/src/index.ts',
      },
    ]);
  });

  it('lets only test files import testkit, and lets testkit use platform-memory', async () => {
    const found = (await violations('dependency-rules-testkit')).map((v) => ({
      rule: v.rule.name,
      from: v.from,
      to: v.to,
    }));
    expect(found).toEqual([
      {
        rule: 'testkit-only-in-tests',
        from: 'packages/store/src/uses-testkit.ts',
        to: 'packages/testkit/src/index.ts',
      },
    ]);
  });
});
