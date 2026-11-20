// .dependency-cruiser.js 的规则本身的测试：在 fixtures/dependency-rules 这个小仓库上运行规则，
// 检查该拒绝的被拒绝、该允许的被允许。
import { cruise, type IViolation } from 'dependency-cruiser';
import { describe, expect, it } from 'vitest';

import config from '../.dependency-cruiser.js';

const FIXTURES = `${import.meta.dirname}/fixtures/dependency-rules`;

async function violations(): Promise<IViolation[]> {
  const result = await cruise(['packages'], {
    ...config.options,
    baseDir: FIXTURES,
    validate: true,
    ruleSet: { forbidden: config.forbidden },
  });
  if (typeof result.output === 'string') throw new Error('unexpected output');
  return result.output.summary.violations;
}

describe('dependency rules', () => {
  it('lets only test files import platform-memory', async () => {
    const found = (await violations()).map((v) => ({
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
});
