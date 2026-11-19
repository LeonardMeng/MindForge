# ADR-0005 Concept 用 slug + 全局前缀，其他实体用 ULID，每个文件都带 `schema_version`

- **状态**：已定
- **日期**：2026-11-19（决策日期早于仓库创建，2026-11-20 补记）

## 背景

数据以文件形式保存，会在多台设备上离线产生，要兼容 Obsidian 的 wikilink，而且文件格式会随版本演进（README 第 1、7 节）。

## 决策

- **Concept**：Workspace 内部用 `slug`（如 `self-attention`），跨 Workspace 引用写成 `<workspace-id>:<slug>`（如 `ai:self-attention`）。frontmatter 里的 `id` 一旦确定就不再改，改名只改 `name`。
- **Evidence、Session、Blindspot、Intervention 等其他实体**：用 ULID。
- **每个结构化文件都带 `schema_version`**（整数）。读取旧版本文件时在内存里迁移；只有用户明确执行 `mastery migrate` 时才改写磁盘。
- 每条 Evidence 记录 `criteria_version`，每个掌握度投影记录 `rules_version`。

## 理由

- Concept 用 slug，文件名和 wikilink 都可读，兼容 Obsidian；`id` 不变，改名只改 `name`。
- ULID 让多台设备离线生成 ID 也不冲突，而且按时间有序，不需要协调。
- 旧版本文件在内存里迁移，只在用户执行 `mastery migrate` 时改写磁盘，避免出现意外的大段 diff。

## 考虑过的其他方案

- **UUIDv4**：无序。
- **自增 ID**：多台设备会冲突。
- **Concept 也用 ULID**：不可读。

## 后果

- schema 包要定义 `Slug`、`GlobalConceptRef`、`Ulid`、`SchemaVersion` 等基础类型（ROADMAP 1.1）。
- 需要一个迁移框架，能从任意旧版本逐级升级，版本过新时报错（ROADMAP 1.6）。

## 相关

- README：第 7 节“ID 和版本”
- ROADMAP：1.1 Schema 公共部分和 ID、1.6 Schema 迁移框架、1.9 Store
