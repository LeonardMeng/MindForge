// 依赖边界规则。依据：README 第 6 节“依赖规则”。
// 每条规则的 comment 写明对应 README 的哪一条；改规则前先改 README（必要时写 ADR）。
//
// 路径约定：
// - 规则只检查各包 src/ 下的文件（包括测试），根目录和包里的配置文件不检查。
// - 内部包通过 "@mastery/source" 条件解析到 packages/<包>/src/…，所以按路径匹配。
// - 嵌套的包：packages/agents/<名>、packages/providers/<名>、packages/tools/<名>。

/** 某个包 src/ 下的文件（用作 from）。 */
const src = (pkg) => `^packages/${pkg}/src/`;
/** 某些内部包里的任意文件（用作 to）。 */
const pkgs = (...names) => `^packages/(${names.join('|')})/`;
/** 任意内部包。 */
const ANY_INTERNAL = '^packages/';
/** 所有包和应用 src/ 下的文件。 */
const ANY_SRC = '^(packages|apps)/.+/src/';
/** 第三方包：解析成功时匹配 node_modules 里的路径，解析失败时匹配模块名本身。 */
const thirdParty = (pattern) =>
  `(^|/)node_modules/(${pattern})/|^(${pattern})(/|$)`;

/**
 * 白名单（README 第 6 节依赖图）：from 包只能依赖自己和 allowed 里的内部包。
 * schema 对所有包开放（README 第 6 节的补充说明），这里统一加上。
 * platform-memory 和 testkit 也放进来，但只有测试文件能用它们，由 *-only-in-tests 两条规则检查。
 */
const allowlist = (pkg, allowed, readme) => ({
  name: `allowlist:${pkg}`,
  severity: 'error',
  comment: `README 第 6 节依赖图：${readme}`,
  from: { path: src(pkg) },
  to: {
    path: ANY_INTERNAL,
    pathNot: pkgs(pkg, 'schema', 'platform-memory', 'testkit', ...allowed),
  },
});

/** 只能引用类型（README 第 6 节里写着“只用…类型”的依赖）：必须是 `import type`。 */
const typeOnly = (fromPkg, toPkg, readme) => ({
  name: `type-only:${fromPkg.replace(/[^\w-]/g, '')}->${toPkg}`,
  severity: 'error',
  comment: `README 第 6 节依赖图：${readme}。只能用 import type`,
  from: { path: src(fromPkg) },
  to: { path: pkgs(toPkg), dependencyTypesNot: ['type-only'] },
});

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    // ── 白名单：README 第 6 节依赖图，一个包一条 ──────────────────────────
    allowlist('schema', [], 'schema ← 不依赖任何内部包'),
    allowlist(
      'platform',
      [],
      'platform ← 只依赖 schema（接口 + 所有实现共用的少量代码）',
    ),
    allowlist(
      'platform-memory',
      ['platform'],
      'platform-memory ← schema, platform（测试用的内存实现）',
    ),
    allowlist(
      'testkit',
      ['platform'],
      'testkit ← schema, platform, platform-memory（只给测试用，加载 fixtures/）',
    ),
    allowlist(
      'platform-node',
      ['platform'],
      'platform-node ← schema, platform（Node 实现，CLI 用）',
    ),
    allowlist('store', ['platform'], 'store ← schema, platform'),
    allowlist('core', ['platform'], 'core ← schema, platform'),
    allowlist('rules-v1', ['core'], 'rules-v1 ← schema, core'),
    allowlist(
      'index',
      ['platform', 'store'],
      'index ← schema, platform, store',
    ),
    allowlist('git', ['platform', 'store'], 'git ← schema, platform, store'),
    allowlist('profile', [], 'profile ← schema'),
    allowlist(
      'profile-store-git',
      ['profile', 'platform', 'store', 'git'],
      'profile-store-git ← profile, schema, platform, store, git',
    ),
    allowlist('device', ['platform'], 'device ← schema, platform'),
    allowlist(
      'plugin-core',
      ['core', 'store', 'index', 'git', 'runtime'],
      'plugin-core ← core, store, index, git, runtime 类型, cordis',
    ),
    allowlist('runtime', ['platform'], 'runtime ← cordis, schema, platform'),
    {
      name: 'allowlist:agents/*',
      severity: 'error',
      comment:
        'README 第 6 节依赖图：agents/* ← cordis, llm 类型, plugin-core 暴露的 knowledge 接口类型',
      from: { path: '^packages/agents/([^/]+)/src/' },
      to: {
        path: ANY_INTERNAL,
        pathNot: '^packages/(agents/$1|schema|llm|plugin-core)/',
      },
    },
    {
      name: 'allowlist:ui-*',
      severity: 'error',
      comment:
        'README 第 6 节依赖图：ui-* ← schema, rpc, ui-kit（不能 import runtime、core、platform）',
      from: { path: '^packages/(ui-[^/]+)/src/' },
      to: { path: ANY_INTERNAL, pathNot: '^packages/($1|schema|rpc|ui-kit)/' },
    },

    {
      name: 'platform-memory-only-in-tests',
      severity: 'error',
      comment:
        'README 第 6 节依赖图的补充说明：platform-memory 是测试用的实现，只有测试文件（*.test.ts）能 import 它；ui-* 和 agents/* 的测试也不能（它们本来就不能用 platform）',
      from: {
        path: ANY_SRC,
        pathNot: ['\\.test\\.ts$', src('platform-memory'), src('testkit')],
      },
      to: { path: pkgs('platform-memory') },
    },
    {
      name: 'testkit-only-in-tests',
      severity: 'error',
      comment:
        'README 第 6 节依赖图的补充说明：testkit 只给测试用（不 build，依赖 Vite 的 import.meta.glob），只有测试文件（*.test.ts）能 import 它；ui-* 和 agents/* 的测试也不能',
      from: { path: ANY_SRC, pathNot: ['\\.test\\.ts$', src('testkit')] },
      to: { path: pkgs('testkit') },
    },

    // ── 只能引用类型：README 第 6 节依赖图里标注“类型”的依赖 ────────────────
    typeOnly('core', 'platform', 'core ← platform（只用端口类型）'),
    typeOnly('rules-v1', 'core', 'rules-v1 ← core（只用规则接口）'),
    typeOnly('plugin-core', 'runtime', 'plugin-core ← runtime 类型'),
    typeOnly('agents/[^/]+', 'llm', 'agents/* ← llm 类型'),
    typeOnly(
      'agents/[^/]+',
      'plugin-core',
      'agents/* ← plugin-core 暴露的 knowledge 接口类型',
    ),

    // ── 硬性禁止：README 第 6 节“硬性禁止”第 1–5 条 ───────────────────────
    {
      name: 'no-cordis-in-pure-packages',
      severity: 'error',
      comment:
        'README 第 6 节硬性禁止第 1 条：schema、core、rules-v1、store、index、git 不能 import cordis',
      from: { path: '^packages/(schema|core|rules-v1|store|index|git)/src/' },
      to: { path: thirdParty('cordis|@cordisjs/[^/]+') },
    },
    {
      name: 'no-node-builtins',
      severity: 'error',
      comment:
        'README 第 6 节硬性禁止第 2 条：除 platform-node、cli、mcp 外不能 import node:*（含不带前缀的 fs 等内置模块）。测试文件同样适用',
      from: { path: ANY_SRC, pathNot: src('(platform-node|cli|mcp)') },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'no-storage-in-agents',
      severity: 'error',
      comment:
        'README 第 6 节硬性禁止第 3 条：agents/*、superagent、supervisor 不能 import store、git、index；读数据走 knowledge 服务，写入走 Proposal',
      from: { path: '^packages/(agents/[^/]+|superagent|supervisor)/src/' },
      to: { path: pkgs('store', 'git', 'index') },
    },
    {
      name: 'no-runtime-or-core-in-ui',
      severity: 'error',
      comment:
        'README 第 6 节硬性禁止第 4 条：ui-* 不能 import runtime 或 core，只能通过 rpc 通信',
      from: { path: '^packages/ui-[^/]+/src/' },
      to: { path: pkgs('runtime', 'core') },
    },
    {
      name: 'tauri-only-in-platform-tauri-and-desktop',
      severity: 'error',
      comment:
        'README 第 6 节硬性禁止第 5 条（ADR-0011）：只有 platform-tauri 和 apps/desktop 能 import @tauri-apps/*',
      from: {
        path: ANY_SRC,
        pathNot: '^(packages/platform-tauri|apps/desktop)/',
      },
      to: { path: thirdParty('@tauri-apps/[^/]+') },
    },

    {
      name: 'schema-runtime-only-zod',
      severity: 'error',
      comment:
        'README 第 6 节硬性禁止第 6 条（ADR-0013）：schema 的运行时代码只能依赖 zod；新增外部依赖必须先写 ADR。测试文件和测试工具不受限制',
      from: {
        path: src('schema'),
        pathNot: '(\\.test\\.ts|/testing\\.ts|/test-helpers\\.ts)$',
      },
      to: { path: '(^|/)node_modules/', pathNot: '(^|/)node_modules/zod/' },
    },

    // ── 规则自身的保险 ────────────────────────────────────────────────────
    {
      name: 'no-unresolvable',
      severity: 'error',
      comment:
        '解析不了的 import 会绕过上面所有按路径匹配的规则（比如 @mastery/source 条件失效），所以必须能解析',
      from: { path: ANY_SRC },
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: '(^|/)node_modules/' },
    // 让 import type 也出现在依赖图里，并标记为 type-only。
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['@mastery/source', 'import', 'types', 'default'],
      mainFields: ['module', 'main', 'types', 'typings'],
      // NodeNext 风格的 './x.js' → './x.ts' 由 dependency-cruiser 自己处理。
      extensions: ['.ts', '.tsx', '.d.ts', '.js', '.mjs'],
    },
  },
};
