# ADR-0003 所有 I/O 通过 Platform 端口；Runtime 在桌面和移动端都运行在 Web Worker 里

- **状态**：已定
- **日期**：2026-11-19（决策日期早于仓库创建，2026-11-20 补记）

## 背景

应用要跑在 macOS、Windows、Linux、iOS、Android 五个平台上（Tauri 2），另外还有 CLI 和无界面模式（README 第 4、10 节）。文件、Git、SQLite 的访问方式在每个平台上都不一样。

## 决策

- 所有 I/O（文件、时钟、ID 生成、锁、SQLite、Git 等）都通过 Platform 端口。端口只定义接口（`platform` 包），由各平台分别实现：`platform-memory`（测试）、`platform-node`（CLI）、`platform-tauri`（Rust 插件：文件、gitoxide、rusqlite + FTS5、文件监听）。
- Runtime 在桌面和移动端都运行在 Web Worker 里，UI 通过类型化的 RPC 和它通信。CLI 和无界面模式在 Node 上运行同一个 Runtime。

## 理由

- iOS 不允许应用启动子进程，所以 Node sidecar 在移动端行不通。
- 所有平台走同一条运行路径。
- 文件、Git、SQLite 都下沉到 Tauri 的 Rust 插件里，不依赖系统里装的 git。
- 以后加 Web 版只需要再写一个 `platform-web`。

## 考虑过的其他方案

- **桌面端用 Node / Bun sidecar**：最初的方案。因为移动端不可行，而且会出现两套运行路径，所以放弃。Node 只留给 CLI、无界面模式和 MCP。
- **Electron + Capacitor**：保留为后备。如果 Linux 上 WebKitGTK 的问题太多，桌面端可以换成它。
- **Flutter**：UI 要改用 Dart，和 TS 写的 agent、Cordis 生态割裂。
- **React Native**：桌面支持弱，基本不支持 Linux。

## 后果

- 除 `platform-node`、`cli`、`mcp` 外，所有包都不能 import `node:*`，也不能用 Node 专有的全局对象（依赖规则硬性禁止第 2 条，包括测试）。
- 每个 Platform 实现都要通过同一套契约测试（ROADMAP 1.7）。
- 原子写、离线可用等不变量要在每个 Platform 实现上都成立（不变量 6、7）。

## 相关

- README：第 4 节架构图、第 6 节依赖规则、第 9 节不变量 6 和 7、第 10 节技术栈
- ROADMAP：1.7 Platform 端口和内存实现、1.8 Node 平台实现、6.2 和 6.3 Rust 插件、6.4 Runtime 运行在 Worker 里
- ADR-0011（Tauri 调用只放在 `platform-tauri` 和 `apps/desktop`）
