# ADR-0011 只有 `platform-tauri` 和 `apps/desktop` 能 import `@tauri-apps/*`

- **状态**：已定
- **日期**：2026-11-19（决策日期早于仓库创建，2026-11-20 补记）

## 背景

桌面端和移动端用 Tauri 2（README 第 10 节），但 UI 是 React + TypeScript，五个平台共用（README 第 4 节）。如果 UI 直接调用 Tauri，UI 就和 Tauri 绑死了。

## 决策

只有 `platform-tauri` 和 `apps/desktop` 能 import `@tauri-apps/*`。其他包，特别是 `ui-*`，都不能直接调用 Tauri。

## 理由

- 保留以后做 Web 版的可能（`platform-web`：OPFS + SQLite WASM + isomorphic-git），以及“网页 UI 连接远程 Runtime”的远程模式。
- 如果 Tauri 调用散落在 UI 里，以后要一个个找出来重写。

## 考虑过的其他方案

- **先允许，以后再重构**：成本高，而且越拖越高。

## 后果

- README 第 6 节硬性禁止第 5 条；dependency-cruiser 规则 `tauri-only-in-platform-tauri-and-desktop` 负责检查。
- dependency-cruiser 只能看到 import，看不到 `window.__TAURI__` 这样的全局对象，需要另外检查（已记入 ROADMAP“待整理”）。

## 相关

- README：第 6 节依赖规则硬性禁止第 5 条；CLAUDE.md
- ROADMAP：0.2 依赖边界检查、6.1–6.3 Tauri 外壳和 Rust 插件
- ADR-0003（I/O 通过 Platform 端口）
