# 新建一个包

所有包都从 `packages/_template` 复制出来。下面以新建 `@mastery/schema` 为例。

## 1. 复制模板

```bash
cp -R packages/_template packages/schema
rm -rf packages/schema/dist packages/schema/node_modules
```

目录名就是包名去掉 `@mastery/` 前缀。嵌套的包（比如 `packages/providers/ollama`）要先在 `pnpm-workspace.yaml` 里加上对应的通配符（`packages/providers/*`），再把新包 `tsconfig.json` 里 `extends` 的路径和 `test` 脚本里 `--config` 的路径各加一层 `../`。

## 2. 要改的地方

| 文件 | 改什么 |
|---|---|
| `package.json` | `name` 改成 `@mastery/schema`；改写 `description` |
| `src/index.ts` | 删掉 `identity`，写这个包的公共 API（导出的东西都要有 TSDoc 注释） |
| `src/index.test.ts` | 换成这个包的测试 |
| `README.md` | 写明这个包负责什么、公共 API，以及依赖哪些内部包 |

`exports`、`scripts`、`tsconfig.json` 一般不用改。

## 3. 依赖

- 依赖其他内部包时用 workspace 协议：`pnpm --filter @mastery/schema add @mastery/platform@workspace:*`。先查 README 第 6 节，确认这条依赖是允许的。
- 如果新包还没出现在 README 第 6 节的依赖图里，要在同一个任务里补上它能依赖哪些包，并在 `.dependency-cruiser.js` 里加一条对应的 `allowlist(...)`（README 第 12 节第 10 条）。
- TypeScript、Vitest、tsup、eslint 这类开发工具只装在根目录，包里不要重复安装。
- 新增第三方依赖要在任务方案里写明理由（README 第 12.8 条）。

## 4. 验证

```bash
pnpm install
pnpm --filter @mastery/schema test
pnpm --filter @mastery/schema build
pnpm check
```

## 模板里各项约定的作用

- **`"type": "module"`**：只用 ESM。在 `NodeNext` 模式下，相对路径 import 要写 `.js` 后缀（`import { x } from './x.js'`），源文件仍然是 `.ts`。
- **`exports` 里的 `"@mastery/source"` 条件**：仓库内部的 TypeScript 和 Vitest 会直接解析到 `src/index.ts`，所以包之间互相引用时不需要先 build；Node 运行和发布时用的是 `dist/`。
- **`tsconfig.base.json` 里的 `types: []`**：包里默认没有 Node 的全局类型。只有 README 允许使用 `node:*` 的包（`platform-node`、`cli`、`mcp`）才在自己的 `tsconfig.json` 里加 `"types": ["node"]`，并在依赖里加上 `@types/node`。
- **测试文件**：和源文件放在一起，命名为 `*.test.ts`，放在 `src/` 下面。
