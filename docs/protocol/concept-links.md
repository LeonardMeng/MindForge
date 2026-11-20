# concept-links.yaml

**跨 Workspace** 的概念关系，放在 Profile 里（Git 实现里是 `MasteryProfile/concept-links.yaml`）。只能通过 `ProfileStore` 读写。JSON Schema：[schemas/concept-links.schema.json](schemas/concept-links.schema.json)。

| 字段 | 必填 | 说明 |
|---|---|---|
| `schema_version` | 是 | `1` |
| `links` | 是 | 关系列表，可以是 `[]`；顺序随意 |
| `links[].from` | 是 | 全局引用 `<workspace-id>:<slug>` |
| `links[].relation` | 是 | 现在只有 `requires`：`from` 需要先掌握 `to` |
| `links[].to` | 是 | 全局引用 `<workspace-id>:<slug>` |

```yaml
schema_version: 1
links:
  - { from: ai:self-attention, relation: requires, to: math:matrix-multiplication }
  - { from: ai:softmax, relation: requires, to: math:probability }
```

- 两端必须在**不同**的 Workspace。同一个 Workspace 里的前置依赖写在 Concept 的 frontmatter（`prerequisites`）里。
- 不能指向自己，同一条关系不能出现两次。
- 两端的 Workspace 是否已在 [workspaces.yaml](workspaces.md) 里注册，由 Profile 的领域逻辑检查（1.12），不在格式校验里。

## JSON Schema 检查不了的规则

- 两端在不同的 Workspace；不能指向自己；不能重复。
