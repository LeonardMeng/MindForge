# interventions/&lt;ULID&gt;.yaml

针对某个盲区设计的学习活动。文件可以修改（状态会变化）。没有删除：不再需要的干预标为 `abandoned`。JSON Schema：[schemas/intervention.schema.json](schemas/intervention.schema.json)。

| 字段 | 说明 |
|---|---|
| `schema_version` | `1` |
| `id` | ULID，和文件名一致 |
| `blindspot_id` | 针对哪个盲区。不写 `concept_id`：盲区里已经有了 |
| `method` | `explanation`（讲解）/ `socratic`（苏格拉底式提问）/ `practice`（练习）/ `counterexample`（反例） |
| `content` | 学习活动本身（Markdown），不能为空 |
| `status` | `planned` / `completed` / `abandoned` |
| `closed_at` | `planned` 时为 `null`；`completed` 或 `abandoned` 时为结束时间（必须写出来） |
| `source` | `{ kind: agent, id, model }` 或 `{ kind: human }` |
| `created_at` | 创建时间 |

```yaml
schema_version: 1
id: 01JD6C0A0A0A0A0A0A0A0A0A0A
blindspot_id: 01JD6B0A0A0A0A0A0A0A0A0A0A
method: counterexample
content: 给出一个注意力权重全部相等的例子，让学习者解释输出为什么是平均值。
status: planned
closed_at: null
source: { kind: agent, id: agent-teacher, model: ollama:qwen3-14b }
created_at: 2026-11-20T08:10:00Z
```

完成后的验证证据怎么和干预关联，在 7.2 决定。

## JSON Schema 检查不了的规则

- `planned` 时 `closed_at` 必须是 `null`，其他状态必须有值，并且不能早于 `created_at`。
