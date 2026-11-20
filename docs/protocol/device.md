# device.yaml

`~/.mastery/device.yaml`：**只属于这台设备**的配置。它不进 Profile，不提交，不同步（不变量 13），因为每台设备的路径、存储空间和网络条件都不一样。JSON Schema：[schemas/device.schema.json](schemas/device.schema.json)。

```yaml
schema_version: 1
device:
  id: 01JD4A0Y3S8M2K7Q5N1V6B9C0D       # ULID，首次启动时生成，之后不变
  name: 工作笔记本                       # 显示用，可修改
  platform: macos                        # macos | windows | linux | ios | android
profile:
  store: git                             # git | cloud
  path: ~/MasteryProfile
workspaces:
  ai:
    path: ~/Mastery/ai
    sync: auto                           # auto | manual | on-demand
    checkout: full                       # full | text-only
  math:
    path: ~/Mastery/math
    sync: on-demand
    checkout: text-only
sync:
  on_metered_network: false
  interval_minutes: 15                   # 1–1440
storage:
  resources_dir: ~/Mastery/_resources
  max_cache_mb: 2048                     # ≥ 0
models:
  local_runtime: ollama                  # 没有本地模型时两项都写 null
  local_endpoint: http://127.0.0.1:11434
```

| 字段 | 说明 |
|---|---|
| `device` | `id`（ULID）、`name`、`platform` |
| `profile` | `store: git` 时写 `path`；`store: cloud` 时写 `endpoint`（`http(s)://`）和 `cache_path`（本地完整副本，不变量 11）。`cloud` 的格式已经定下，但在 9.7 实现之前应用会明确拒绝它 |
| `workspaces` | Workspace id → `path`、`sync`、`checkout`，三项都必须写出（`checkout` 没有默认值，同一个值只有一种写法）。可以是 `{}` |
| `sync` | `on_metered_network`（计费网络下是否同步）、`interval_minutes` |
| `storage` | `resources_dir`（外部资源文件的位置，不用符号链接）、`max_cache_mb` |
| `models` | `local_runtime`（slug，比如 `ollama`）和 `local_endpoint`（`http(s)://`），同时有值或同时为 `null` |

所有段都必须写出（`device.yaml` 由应用生成）。

- **本机路径**必须是绝对路径：`/…`、`~` 或 `~/…`、`C:\…` 或 `C:/…`、`\\server\share`。
- 地址不能带用户名和密码（`secret.credentials_in_url`）。

## 密钥检查

**密钥只放在系统钥匙串里**（Keychain、Windows Credential Manager、Secret Service、Android Keystore）。`device.yaml` 最多记录钥匙串条目的名称，这类字段的名字里不要用下面的词（比如用 `keychain_entry`）。

为了拦住最常见的失误，`device.yaml`、`defaults.yaml`、`workspaces.yaml` 和 `workspace.yaml`（插件配置）在校验时会检查：

- **字段名**（任意深度）：按 `_`、`-`、`.`、驼峰拆成词后整词比较，含有 `token`、`secret(s)`、`password(s)`、`passwd`、`apikey`、`credential(s)`，或者相邻的 `api` + `key`、`private` + `key`，报 `secret.field_not_allowed`。`max_tokens` 不算（`tokens` 不是 `token`）；`token_limit` 这类无害的名字会被拒绝，改个名字即可。
- **值**（任意深度的字符串）：看起来像常见的 token，报 `secret.value_not_allowed`：GitHub（`ghp_`、`gho_`、`ghu_`、`ghs_`、`ghr_`、`github_pat_`）、OpenAI / Anthropic（`sk-`、`sk-proj-`、`sk-ant-`）、AWS access key ID（`AKIA` 加 16 个大写字母或数字）、私钥（`-----BEGIN … PRIVATE KEY-----`）。错误信息里不包含值本身。
- 找到密钥时只报密钥的错误，去掉之后才会报其他问题。

**这只是一道保险，不是安全边界。** 换个名字、换种写法都能绕过它。真正的规则是密钥只放在钥匙串里。Concept 的 frontmatter 不做这个检查（那里是 Obsidian 的自由字段）。

## JSON Schema 检查不了的规则

- 密钥检查；地址的格式和凭据规则。
- `models` 的两项同时有值或同时为 `null`。
- `workspaces` 的键是 slug。
