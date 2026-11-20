# @mastery/profile-store-git

ProfileStore 的 Git 实现（ROADMAP 1.13）。**现在只做文件读写**：实现 `@mastery/profile` 的 `ProfileBackend` 端口，规则全部由 `createProfileStore` 执行。Git 提交在 3.6 之后接入（那时才加 `git` 依赖），远程同步在 8.1。依赖：`profile`、`platform`、`store`。

```ts
import { createGitProfileStore } from '@mastery/profile-store-git';

const store = createGitProfileStore({ fs, lock, now, generateId }); // fs 以 Profile 根目录为根
```

| 导出 | 说明 |
|---|---|
| `createGitProfileBackend({ fs, lock, lockTimeoutMs? })` | 基于文件的 `ProfileBackend` |
| `createGitProfileStore(options)` | 上面的后端加上 `createProfileStore`（全部规则） |
| `PROFILE_FILES` | 文档 → 文件名：`profile.yaml`、`workspaces.yaml`、`concept-links.yaml`、`defaults.yaml` |
| `PROFILE_WRITE_LOCK` | 写锁的名字 `profile-write`；8.1 的 Git 同步也必须持有它 |
| `profileRevision(hashes)` | revision 的算法 |

## 读

- 四个文件放在 Profile 根目录，用 store 的严格 YAML 解析。解析不了的文件（编码、语法、锚点、标签、重复键等）作为这个文档的解析问题交给上层，报 `profile.invalid`，问题里带 `yaml.*` 错误码和文档名。
- **`profile.yaml` 是 Profile 存在的标志**：它不存在时没有 Profile（即使别的文件还在）。
- 别的文件和目录（`.gitignore`、`learner-model/`、`skills/`、`.mastery/`）不管。

## revision

先分别算每个文件的 SHA-256，再对按文档顺序排列的 `[文档名, 文件哈希或 "missing"]` 列表算 SHA-256。不直接拼接文件内容（拼接有歧义：`"ab"+"c"` 和 `"a"+"bc"`）。用 `globalThis.crypto.subtle`（Node、浏览器、Web Worker 都有），不用 `node:*`。

## 写

- 整个写入在写锁 `profile-write` 里完成：重新读取四个文件、比较 revision、按 `createProfileStore` 给的顺序逐个写入。被别的进程改过时返回 `modified`，什么都不写。
- 每个文件原子写入（Platform 的 `writeTextFile`）。多个文件之间不是原子的，但 `createProfileStore` 选的顺序保证每写完一个文件 Profile 都是合法的，所以中途崩溃总是留下合法的 Profile。创建时 `profile.yaml` 最后写，创建到一半崩溃可以重新创建。
- 已有的文件在原文上修改（store 的 `patchYaml`）：注释、顺序、引号风格保留；新文件写成规范形式。
- 锁文件放在 Profile 的 `.mastery/runtime/locks/`（`createNodePlatform` 的默认位置）；`.mastery/` 和 `.mastery-tmp-*` 由 Profile 的 `.gitignore` 忽略（1.15 生成）。

## watch

监听 Profile 根目录。自己写入的变化报 `local`（文件监听对这些写入的通知按内容哈希认出来、丢掉）；别的程序的修改报 `external`。事件只是提示，收到后重新 `load()`。

## 同步

8.1 之前没有远程：`syncStatus()` 是 `{ remote: 'none', online: true, pendingChanges: 0, lastSyncedAt: null, conflicts: [] }`，`sync()` 返回 `no_remote`。契约测试只跑基本部分。

## 测试

在 `platform-memory` 的内存文件系统上运行 1.12 的契约测试，加上：在多文件写入的每一步之后模拟崩溃，Profile 都合法（三个场景：注销被链接的 Workspace、一次保存里注册 Workspace 并链接到它、一次保存改四个文档）；创建到一半崩溃后可以重新创建；注释保留；版本过新的文件不被覆盖；两个进程同时注册不同的 Workspace 都不丢；写锁超时。本包的测试不能 import `platform-node`（依赖规则），真实磁盘上的测试在 1.15 的 CLI 里做。
