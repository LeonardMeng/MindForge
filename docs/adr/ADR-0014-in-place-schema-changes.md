# ADR-0014 schema 只在一种文件第一次真正使用之前可以原地修改

- **状态**：已定
- **日期**：2026-11-20

## 背景

ADR-0005 规定每个文件都带 `schema_version`，文件格式变化时升版本并写迁移（`docs/adding-a-migration.md`）。但在还没有任何真实数据之前，为每一次格式调整都升版本、写一步只在测试里跑的迁移，只会留下没有意义的旧版本。2.7 给掌握度投影加 `review_due_at` 时遇到了这个问题。

## 决策

- 一种文件**第一次真正使用之前**，可以直接修改它当前版本的 schema（原地修改），不升 `schema_version`、不写迁移。
- “第一次真正使用”：
  - **派生的文件**（`mastery-projection`、`mastery-history-entry`）：第一次发布。在那之前它们只由测试和开发时的重算写出，随时可以重新算出。
  - **其他所有文件**（Concept、criteria、`workspace.yaml`、项目、评测会话、Evidence、Blindspot、Intervention、Proposal、Profile 的四个文档、`device.yaml`）：**从现在（2026-11-20）开始**。M1 检查点里人已经在手写真实的文件。
- 从那以后，每一次格式变化都要升版本并写迁移，按 `docs/adding-a-migration.md` 的步骤，旧版本样例永久保留。
- 每一次原地修改都写进对应任务的完成记录，列出因此改动的已有测试预期。

## 理由

- 原地修改只在没有真实文件时才安全：没有文件会因此变得读不了。
- 派生文件丢了可以重算，所以可以放宽到第一次发布；用户写的文件丢不起，必须从人开始手写的那一刻起就按版本演进。

## 考虑过的其他方案

- **任何时候都升版本**：发布前会积累很多只有测试用到的迁移和旧样例。
- **发布前所有文件都可以原地修改**：M1 检查点手写的真实文件会在不知不觉中变得不合法。

## 后果

- 2.7 原地给 `mastery-projection` v1 加了必填的 `review_due_at`（ROADMAP 完成记录列出了改动的预期）。
- 第一次发布前要在 ROADMAP 里记下“派生文件从此也要升版本”。
- `docs/adding-a-migration.md` 引用本 ADR。

## 相关

- ADR-0005（`schema_version` 和迁移）、ADR-0013（文件格式约定）
- `docs/adding-a-migration.md`、ROADMAP 1.6、2.7、M1 检查点
