# defaults.yaml

插件和模型的默认配置，放在 Profile 里（Git 实现里是 `MasteryProfile/defaults.yaml`），Workspace 的 `workspace.yaml` 可以覆盖。只能通过 `ProfileStore` 读写。JSON Schema：[schemas/profile-defaults.schema.json](schemas/profile-defaults.schema.json)。

| 字段 | 必填 | 说明 |
|---|---|---|
| `schema_version` | 是 | `1` |
| `plugins` | 是 | 插件名 → 插件配置对象，规则和 [workspace.yaml](workspace.md) 相同；没有写 `{}` |
| `model` | 是 | 默认模型 `<provider>:<model>`；没有设置时写 `null` |

```yaml
schema_version: 1
plugins:
  agent-evaluator: { style: strict, max_tokens: 2048 }
model: ollama:qwen3-14b
```

- **不能有密钥**（见 [device.md](device.md#密钥检查)）。API key 放在系统钥匙串里，插件从钥匙串读取。

## JSON Schema 检查不了的规则

- 插件名的长度、`x` 和 `~x` 不能同时出现（同 workspace.yaml）。
- 密钥检查。
