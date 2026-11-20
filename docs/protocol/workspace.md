# workspace.yaml

一个 Workspace 的配置，放在 Workspace 根目录。用户可以编辑。JSON Schema：[schemas/workspace.schema.json](schemas/workspace.schema.json)。

| 字段 | 必填 | 说明 |
|---|---|---|
| `schema_version` | 是 | `1` |
| `id` | 是 | Workspace 的 id（slug），也是全局引用 `<id>:<slug>` 的前缀 |
| `name` | 是 | 显示名称，不能为空 |
| `description` | 否 | 简介，写了就不能为空 |
| `plugins` | 是 | 插件名 → 插件配置对象；没有插件写 `{}` |

```yaml
schema_version: 1
id: ai
name: AI
plugins:
  agent-teacher: { style: socratic }
  agent-evaluator: { model: cloud:anthropic }
  ~agent-research: {}        # ~ 前缀表示禁用
```

- 插件名是 slug，前面可以加 `~` 表示禁用。
- 插件配置必须是对象；没有配置写 `{}`，不能写成空值（`agent-teacher:`）。
- 配置对象的内容由插件自己的 schema 校验（4.3），这里原样保留。
- SuperAgent 也是普通插件（比如 `superagent-default`），写在 `plugins` 里，没有单独的字段。
- 这个文件会提交到 Git、跟着仓库分享，所以插件配置里**不能有密钥**：看起来像密钥的字段名和常见格式的 token 都会被拒绝（规则见 [device.md](device.md#密钥检查)）。API key 放在系统钥匙串里。

## JSON Schema 检查不了的规则

- 插件名（不含 `~`）最长 64 个字符。
- 同一个插件不能同时以 `x` 和 `~x` 出现。
- 密钥检查。
