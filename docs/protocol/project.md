# projects/&lt;slug&gt;/project.yaml

Workspace 里的一个具体学习或研究目标。用户可以编辑。JSON Schema：[schemas/project.schema.json](schemas/project.schema.json)。

| 字段 | 必填 | 说明 |
|---|---|---|
| `schema_version` | 是 | `1` |
| `id` | 是 | slug，和目录名一致 |
| `name` | 是 | 不能为空 |
| `description` | 否 | 写了就不能为空 |
| `status` | 是 | `active` / `paused` / `completed` / `archived` |
| `concepts` | 是 | 这个 Project 关注的 Concept 的 slug；可以是 `[]`，不能重复 |

```yaml
schema_version: 1
id: read-attention-paper
name: 读懂 Attention Is All You Need
status: active
concepts: [self-attention, multi-head-attention]
```

## JSON Schema 检查不了的规则

- `id` 和目录名一致；`concepts` 里的 Concept 都存在。由 `mastery validate` 检查。
