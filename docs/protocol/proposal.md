# Proposal（变更提案）

agent（或用户）提交给 knowledge 服务的一组变更操作。agent 不能直接写文件，只能提交 Proposal（README 第 3、4 节）。**存放位置待定（4.2 / 6.8）**。JSON Schema：[schemas/proposal.schema.json](schemas/proposal.schema.json)。示例：[examples/proposal.json](examples/proposal.json)。

| 字段 | 说明 |
|---|---|
| `schema_version` | `1` |
| `id` | ULID |
| `created_at` | 创建时间 |
| `source` | `{ kind: agent, id, model }` 或 `{ kind: human }` |
| `run_id` | 产生这个提案的 agent 运行记录（4.5）；用户直接提交时为 `null`（必须写出来） |
| `summary` | 为什么提这个变更，不能为空 |
| `requires_approval` | 提交者是否**请求**人工审批 |
| `operations` | 变更操作，不能为空 |

**`requires_approval` 只是请求，不是决定。** Mastery Core 按规则判断，只能把 `false` 升级为 `true`，不能把 `true` 降为 `false`，agent 不能靠填 `false` 绕过审批。

Proposal 不带审批状态：待审批、已接受、已拒绝属于审批队列。

## 变更操作

更新类操作给出**完整的新内容**（不用补丁），内容按对应文件的格式校验。

| `op` | 内容 |
|---|---|
| `concept.create` | `frontmatter`、`body` |
| `concept.update` | `concept_id`、完整的新 `frontmatter` 和 `body` |
| `criteria.set` | 完整的 `criteria`（新建或发布新版本） |
| `blindspot.create`、`blindspot.update` | 完整的 `blindspot` |
| `blindspot.merge` | `target_id`、`source_ids` |
| `intervention.create`、`intervention.update` | 完整的 `intervention` |

**没有删除操作。** Concept、Blindspot、Intervention 都只能通过状态归档：Concept 设为 `archived`，Blindspot 设为 `resolved`（或合并后的 `merged`），Intervention 设为 `abandoned`。

Evidence 不走 Proposal（用 `submitEvidence()`）；掌握度只能由 Mastery Core 计算；用户的笔记不通过 Proposal 修改。

## JSON Schema 检查不了的规则

- 每个操作内容里各自的跨字段规则（见对应文件的说明页）。
- `concept.update` 的新 `frontmatter.id` 必须等于 `concept_id`（Concept 的 id 不能改）。
- `blindspot.merge` 的 `source_ids` 不能包含 `target_id`。
- 提案生成后、批准前文件已被改动（并发冲突）怎么处理，在 4.2 决定。
