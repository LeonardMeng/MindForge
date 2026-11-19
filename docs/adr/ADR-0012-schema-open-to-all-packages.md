# ADR-0012 所有包都可以依赖 `schema`，包括 `ui-*`

- **状态**：已定
- **日期**：2026-11-19（决策日期早于仓库创建，2026-11-20 补记）

## 背景

README 第 6 节的依赖图原先没有给 `ui-*`、`plugin-core`、`agents/*` 列出 `schema`，`ui-*` 只能依赖 `rpc` 和 `ui-kit`。但任务 6.6 要求编辑器在保存前做内联校验。

## 决策

所有包都可以依赖 `schema`，包括 `ui-*`。`ui-*` 的其他限制不变：不能 import `runtime`、`core`、`platform`，和 Runtime 只能通过 `rpc` 通信。

## 理由

- `schema` 是纯定义，没有 I/O，也不依赖 Node。
- 任务 6.6 要求编辑器在保存前内联校验，UI 需要直接调用 schema 的校验函数。

## 考虑过的其他方案

- **UI 通过 rpc 让 Runtime 做校验**：每次输入都要往返一次，延迟高，也更复杂。
- **rpc 只重新导出类型**：解决不了运行时校验的问题。

## 后果

- README 第 6 节补充了“所有包都可以依赖 schema”的说明；`ui-*` 那一行改成 `ui-* ← schema, rpc, ui-kit`。
- dependency-cruiser 的每个白名单都自动包含 `schema`。
- `schema` 必须保持纯净：不能 import 其他内部包，不能做 I/O，也不能依赖 Node。依赖规则已经要求 schema 不依赖任何内部包、不能 import `node:*`。

## 相关

- README：第 6 节依赖规则
- ROADMAP：0.2 依赖边界检查、6.6 Concept 和笔记编辑
