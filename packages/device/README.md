# @mastery/device

设备配置（ROADMAP 1.14）。依赖：`schema`、`platform`、`store`（用 store 的 `yamlFile` 读写 YAML，规则和 Workspace 的文件完全一样）。

`device.yaml` 只属于这台设备：不提交、不同步、不能有密钥（不变量 13）。本包的函数接收一个以设备目录（通常是 `~/.mastery/`）为根的 `FileSystem`，解析 `~` 是调用方（CLI、桌面应用）的事。

## device.yaml

| 函数 | 说明 |
|---|---|
| `loadDevice(fs)` | 读取；文件不存在时返回 null。校验失败报 `device.invalid`（带具体问题），版本过新报 `device.version_too_new`，`profile.store: cloud` 报 `device.cloud_profile_unsupported`（9.7 之前，不会当成 git 处理） |
| `saveDevice(fs, config, { base })` | 带 `base` 时更新（读取之后被改过就报 `device.modified_since_read`，只改动变化的部分，注释保留）；不带时创建（已存在时报 `device.already_exists`） |
| `initDevice(fs, device)` | 首次运行：生成设备 ULID，创建没有任何 Workspace 的 `device.yaml`，同步和缓存用默认值 |
| `regenerateDevice(fs, registry, device)` | `device.yaml` 丢失后根据 Profile 重新生成：新的设备 id，不包含任何 Workspace（本机路径要用户重新确认），返回需要确认的 Workspace |

没有锁：每次保存都检查读取之后有没有被改过，两个程序同时写时后写的那个会收到 `device.modified_since_read`。

### 不会被提交

- `initDevice` 和 `regenerateDevice` 先在设备目录里创建 `.gitignore`，内容只有一行 `*`：即使设备目录被放进了某个 Git 仓库（比如把整个 home 目录纳入版本管理的 dotfiles 仓库），里面的东西也不会被提交。已有的 `.gitignore` 不动。
- `checkDeviceLocation(deviceDir, config, home)`：设备目录落在 Profile 或某个 Workspace 的目录里时（比如 Workspace 放在 `~`）报 `device.inside_repository`。展开 `~`，Windows 路径不区分大小写和分隔符。

## Workspace 在本机的状态

`workspaceStates(device, registry)` 是纯函数，只根据两份配置：

| 状态 | 含义 |
|---|---|
| `configured` | Profile 里注册了，`device.yaml` 里有它的位置 |
| `not_configured` | Profile 里注册了，`device.yaml` 里没有：这台设备还没配置它，UI 里显示为可下载 |
| `unregistered_local` | `device.yaml` 里有，Profile 里已经注销：提示用户保留本地副本还是删除 |

`sync` 方式（`auto` / `manual` / `on-demand`）说的是什么时候拉取，不表示在不在本机，所以不参与判断。`configured` 的 Workspace 是否真的在磁盘上，由 CLI 检查目录是否存在（1.15）。

## SecretStore（系统钥匙串）

```ts
interface SecretStore {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
}
```

- 条目名是用 `/` 分开的 slug，比如 `provider-openai/api-key`，不合法时报 `secret.invalid_name`（错误里不写出不合法的名字，以防把密钥误当成了名字）；值不能为空（`secret.empty_value`）；钥匙串用不了时报 `secret.unavailable`。
- `SecretStoreError` **任何情况下都不包含值**：消息、`toString()`、`stack`、JSON 序列化里都只有错误码和条目名（有测试）。
- `MemorySecretStore` 测试用，`setUnavailable(true)` 模拟钥匙串被锁住。真实的实现在 M6（Tauri）和 CLI 里。
