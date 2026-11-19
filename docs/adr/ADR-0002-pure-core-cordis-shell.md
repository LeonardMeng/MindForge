# ADR-0002 纯 Core + Cordis 插件外壳；`knowledge` 服务受保护

- **状态**：已定
- **日期**：2026-11-19（决策日期早于仓库创建，2026-11-20 补记）

## 背景

系统要求“一切皆插件”：Agent、工具、模型、规则都能插拔，插件系统用 Cordis（README 第 1、4 节）。同时，掌握度必须由评测证据推导，只有 Mastery Core 能计算（“以证据定掌握”原则）。

## 决策

- Mastery Core（`core`、`rules-v1` 等）是纯 TypeScript，不依赖 Cordis，也不依赖运行时。
- `plugin-core` 是 Core 的插件外壳，把 Core 包装成 `knowledge` 服务；它是 Core 和 Cordis 唯一的交汇点。
- `knowledge` 服务受保护：只能由官方的 `plugin-core` 提供，第三方插件只能使用，不能替换。

## 理由

- merge driver、CLI、CI 校验都要在不启动运行时的情况下调用 Core。
- Cordis 的大版本之间 API 有变化。只通过一层薄适配器接触它，升级 Cordis 时 Core 不用改。
- Core 的测试不需要构造 Cordis Context。
- 原始设计文档本来就要求 Core 独立于 Cordis。
- **为什么要保护 `knowledge`**：Cordis 的服务可以被同名服务替换。第三方插件可能注册一个“直接写掌握度”的实现，绕过“掌握度由证据推导”的原则。

## 考虑过的其他方案

- **Core 直接写成 Cordis 插件**：能用，但测试要搭 Context，升级 Cordis 时 Core 要跟着改，而且违背原始设计。
- **Core 作为普通的、可以替换的插件**：可以被绕过。

## 后果

- 对用户和插件作者来说，Core 看起来仍然是一个插件，“一切皆插件”的体验不变。
- `schema`、`core`、`rules-v1`、`store`、`index`、`git` 不能 import `cordis`（依赖规则硬性禁止第 1 条，由 dependency-cruiser 检查）。
- Core 的测试不启动 Cordis，也不调用 LLM（不变量 8）。Agent 不能直接写掌握度（不变量 4）。

## 相关

- README：第 1 节“一切皆插件”“以证据定掌握”、第 4 节“插件模型”、第 6 节依赖规则、第 9 节不变量 4 和 8
- ROADMAP：0.2 依赖边界检查、M2 Mastery Core（2.1–2.8）、M4 运行时和插件
