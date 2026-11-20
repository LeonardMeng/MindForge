# CLAUDE.md

本项目是 Mastery OS：本地优先、基于文件、原生支持 Git 的个人知识掌握系统。

## 每次会话必读

1. `README.md`：架构、依赖规则（第 6 节）、数据协议（第 7 节）、不变量（第 9 节）、工作约定（第 12 节）。
2. `ROADMAP.md`：当前进度和任务定义。**一次会话只做一个任务编号。**

## 最重要的规则

- `schema`、`core`、`rules-v1`、`store`、`index`、`git` 不能 import `cordis`。
- 除 `platform-node`、`cli`、`mcp` 外，不能 import `node:*`。所有 I/O 通过 Platform 端口。
- `ui-*` 不能 import `@tauri-apps/*`。所有和 Tauri 相关的调用只能放在 `platform-tauri` 和 `apps/desktop` 里（将来要有 Web 版）。
- `schema` 的运行时代码只能依赖 `zod`；新增外部依赖必须先写 ADR（ADR-0013）。文件格式遵守“同一个值只有一种写法”。
- Agent 不能直接写文件；只能通过 `knowledge` 服务提交 Proposal 或 Evidence。
- Evidence 只追加。掌握度只由 Mastery Core 计算。没测过的维度是 `null`，不是 0。
- Profile 是必需的，只能通过 `ProfileStore` 端口访问，不能直接读写 Profile 的文件。
- `device.yaml` 不提交、不同步，里面不能有密钥；密钥放在系统钥匙串。
- 不能为了让测试通过而修改不变量、依赖规则或已有测试的预期。需要改时停下来问人。

## 命令

```bash
pnpm check                       # 每个任务结束前必须通过
pnpm --filter @mastery/<包> test
```

## 流程

开始一个任务时，先提醒人从最新的 `main` 创建分支 `task/<编号>-<简短名字>`（分支由人创建）。

先用 plan mode 出方案 → 人确认 → 先写测试 → 实现 → `pnpm check` → 在 ROADMAP 里勾选任务并填写完成记录。
范围外的发现记到 ROADMAP 的“待整理”一节。

## Git

- 提交由人来做。AI 助手只给出要提交的文件清单和建议的 commit message。
- commit message 和 PR 描述里**不加任何 AI 署名**：不写 `Co-Authored-By: Claude …`、`Claude-Session: …`、“Generated with Claude Code” 之类的行。提交的作者只能是人。
