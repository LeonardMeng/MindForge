# profile.yaml

Profile 里用户本人的基本信息和偏好，放在 Profile 根目录（Git 实现里是 `MasteryProfile/profile.yaml`）。只能通过 `ProfileStore` 读写（不变量 12）。JSON Schema：[schemas/profile.schema.json](schemas/profile.schema.json)。

| 字段 | 必填 | 说明 |
|---|---|---|
| `schema_version` | 是 | `1` |
| `id` | 是 | Profile 的 id（ULID），创建时生成，之后不变 |
| `name` | 是 | 显示名称，不能为空 |
| `language` | 是 | 界面和讲解用的语言，BCP 47 标签 |
| `weekly_minutes` | 是 | 每周的学习时间预算（分钟），0–10080；没有设置时写 `null` |

```yaml
schema_version: 1
id: 01JD4A0Y3S8M2K7Q5N1V6B9C0D
name: Parker
language: zh-CN
weekly_minutes: 300
```

- 学习目标暂时不在这里（7.4 / 8.4 才用到，到时很可能每个目标一个文件，避免多台设备同时修改同一个列表）。
- 学习者画像在 `learner-model/`（M8），也不在这里。

## JSON Schema 检查不了的规则

- 没有。`language` 的规则（下面）已经写在 JSON Schema 的 `pattern` 里。

语言标签只有一种大小写写法：语言是 2–3 个小写字母，可以跟文字（首字母大写的 4 个字母）和地区（2 个大写字母或 3 位数字），例如 `zh-CN`、`zh-Hans-CN`、`en`、`es-419`。`zh-cn`、`zh_CN` 不接受。
