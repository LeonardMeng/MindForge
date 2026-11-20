# workspaces.yaml

Profile 里已注册的 Workspace（Git 实现里是 `MasteryProfile/workspaces.yaml`）。会提交并同步到所有设备，所以**不写本地路径**：每台设备上的路径在 [device.yaml](device.md) 里。只能通过 `ProfileStore` 读写。JSON Schema：[schemas/workspace-registry.schema.json](schemas/workspace-registry.schema.json)。

| 字段 | 必填 | 说明 |
|---|---|---|
| `schema_version` | 是 | `1` |
| `workspaces` | 是 | Workspace 列表，可以是 `[]` |
| `workspaces[].id` | 是 | Workspace 的 id（slug），不能重复 |
| `workspaces[].name` | 是 | 显示名称 |
| `workspaces[].remote` | 是 | Git 远程地址；没有远程时写 `null` |

```yaml
schema_version: 1
workspaces:
  - id: ai
    name: AI
    remote: git@github.com:me/mastery-ai.git
  - id: math
    name: 数学
    remote: git@gitea.local:me/mastery-math.git
  - id: drafts
    name: 草稿
    remote: null
```

`remote` 接受这些写法：`git@host:path`（scp 风格）、`ssh://git@host/path`、`git://host/path`、`https://host/path`。

- **不能是本机路径**：`/…`、`~/…`、`./…`、`C:\…`、`\\server\…`、`file://…` 都报 `remote.local_path`。U 盘、NAS 这类每台设备路径不同的远程，以后由 `device.yaml` 按 Workspace 覆盖（见 ROADMAP“待整理”）。
- **不能带凭据**：`https://` 和 `http://` 不能带任何用户信息（`https://ghp_…@github.com/…` 是 token 泄露最常见的写法）；`ssh://` 可以带用户名，不能带密码。报 `secret.credentials_in_url`。
- 和其他 Profile 文件一样做密钥检查（见 [device.md](device.md#密钥检查)）。

## JSON Schema 检查不了的规则

- Workspace 的 `id` 不能重复。
- `remote` 的格式、本机路径和凭据的规则。
