import { defaultClientConditions, defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

// 包之间互相 import 时直接解析到源码（package.json exports 里的 "@mastery/source"），
// 测试前不需要先 build。Vite 的 conditions 是整体覆盖的，所以要带上默认值。
const SOURCE_CONDITION = '@mastery/source';

// 全仓唯一的 Vitest 配置。
// - 在仓库根目录运行：跑所有包的测试。
// - 在包目录运行（`--config ../../vitest.config.ts --root .`）：只跑该包的测试。
export default defineConfig({
  resolve: { conditions: [SOURCE_CONDITION, ...defaultClientConditions] },
  ssr: {
    resolve: { conditions: [SOURCE_CONDITION, ...defaultServerConditions] },
  },
  test: {
    // tests/ 是仓库级的测试（比如依赖规则本身）；tests/fixtures/ 只是测试用的样例文件。
    include: ['**/src/**/*.test.ts', 'tests/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/fixtures/**'],
  },
});
