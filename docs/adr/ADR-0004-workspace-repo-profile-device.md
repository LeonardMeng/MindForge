# ADR-0004 一个 Workspace 一个仓库；Profile 必需，通过 ProfileStore 访问；设备配置放在 device.yaml

- **状态**：已定
- **日期**：2026-11-19（决策日期早于仓库创建，2026-11-20 补记）

## 背景

用户会有多个知识领域（Workspace），在多台设备上使用，并且需要一份跟着用户走的用户级数据：学习者画像、已注册的 Workspace、跨 Workspace 的概念链接（README 第 2、7 节）。

## 决策

- 一个 Workspace 对应一个 Git 仓库。
- **Profile 必需**：每个用户有且只有一个 Profile，只能通过 `ProfileStore` 端口访问。现在用 Git 仓库实现（`profile-store-git`），将来可以换成云服务（`profile-store-cloud`），但云端实现必须在本地保留完整副本。
- 只属于某一台设备的配置（Workspace 在本机的路径、同步策略等）放在 `~/.mastery/device.yaml`，不提交、不同步。密钥放在系统钥匙串，不写进 `device.yaml`。

## 理由

- 每个 Workspace 可以单独分享、备份，也可以单独选托管平台；仓库保持小；手机可以只拉需要的 Workspace。
- Profile 将来可能变成云服务，所以现在就规定所有代码只能通过 `ProfileStore` 访问它。云端实现也必须保留本地完整副本，保证本地优先。
- `device.yaml` 单独存在，是因为每台设备的路径和条件都不一样，同步会互相覆盖。

## 考虑过的其他方案

- **Profile 作为父仓库，用 submodule 引用各 Workspace**：版本指针容易冲突，人和 AI 都容易用错。
- **所有内容放进一个大仓库**：资源文件会把仓库撑大，也没法单独分享一个科目。
- **Profile 可选**：最初的方案。2026-11-19 由项目负责人否决，理由是 Profile 将来会是云服务。

## 后果

- 启动顺序：先读 `device.yaml`，再通过 `ProfileStore` 加载 Profile，然后打开 Workspace（README 第 7 节“启动顺序”）。
- 除了 `profile-store-*` 的实现包，没有任何代码直接读写 Profile 的文件或调用云服务接口（不变量 12）。
- Profile 必需，但必须离线可用（不变量 11）；`device.yaml` 不外泄、不含密钥（不变量 13）；单看一个 Workspace 目录也能读懂、能校验（不变量 14）。

## 相关

- README：第 2 节核心概念、第 7 节 Profile / Device / 启动顺序、第 9 节不变量 11–14
- ROADMAP：1.12 ProfileStore 端口和 Profile 领域逻辑、M8 Supervisor 和多 Workspace、9.7 profile-store-cloud
