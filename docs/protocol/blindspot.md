# blindspots/&lt;ULID&gt;.yaml

一个怀疑或已确认的知识缺口、误解或薄弱点。文件可以修改（状态会变化），变化过程由 Git 历史记录。没有删除：不再需要的盲区通过状态归档。JSON Schema：[schemas/blindspot.schema.json](schemas/blindspot.schema.json)。

| 字段 | 说明 |
|---|---|
| `schema_version` | `1` |
| `id` | ULID，和文件名一致 |
| `concept_id` | 在哪个 Concept 上发现的 |
| `type` | `knowledge` / `reasoning` / `application` / `prerequisite` / `retention` |
| `status` | `suspected` / `confirmed` / `resolved`（缺口已经补上）/ `merged`（并入了另一个盲区） |
| `description` | 缺口或误解是什么，不能为空 |
| `prerequisite_id` | `type` 为 `prerequisite` 时是缺失的前置 Concept，其他类型为 `null`（必须写出来） |
| `merged_into` | `status` 为 `merged` 时是并入的盲区，其他状态为 `null`（必须写出来） |
| `evidence_ids` | 支持这个判断的证据，升序、不重复；用户手动记下的盲区可以是 `[]` |
| `source` | `{ kind: agent, id, model }` 或 `{ kind: human }` |
| `created_at` | 创建时间 |

```yaml
schema_version: 1
id: 01JD6B0A0A0A0A0A0A0A0A0A0A
concept_id: self-attention
type: prerequisite
status: confirmed
description: 不会做矩阵乘法，算不出注意力分数。
prerequisite_id: matrix-multiplication
merged_into: null
evidence_ids: [01JD3K8Q8Z6V7X2N4M5P9R0T1W]
source: { kind: agent, id: agent-diagnoser, model: ollama:qwen3-14b }
created_at: 2026-11-20T08:00:00Z
```

`resolved` 和 `merged` 不能混用：`resolved` 表示缺口已经补上，用 `resolved` 表示合并会让统计出错。

## JSON Schema 检查不了的规则

- `type` 为 `prerequisite` 时 `prerequisite_id` 必须有值，其他类型必须是 `null`；不能是 `concept_id` 自己。
- `status` 为 `merged` 时 `merged_into` 必须有值，其他状态必须是 `null`；不能指向自己。
- `evidence_ids` 必须是升序。
- `merged_into` 指向的盲区存在，并且不形成合并链或循环：由 Mastery Core 检查（4.2）。
