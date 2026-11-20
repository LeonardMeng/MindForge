# @mastery/profile

Profile 的端口和领域逻辑（ROADMAP 1.12，ADR-0004）。依赖：只有 `schema`（不依赖 platform、store、git，不用 `node:*`；dependency-cruiser 检查，`tests/dependency-rules.test.ts` 有样例）。

```ts
import { createProfileStore } from '@mastery/profile';

const store = createProfileStore(backend, { now, generateId });
const loaded = await store.load();
if (loaded.ok) {
  await store.registerWorkspace({ id: 'ai', name: 'AI', remote: null });
}
```

## 两层

| | 是什么 | 谁实现 |
|---|---|---|
| `ProfileBackend` | 存储端口：读写四个文档（每个文档是解析后的数据、`missing` 或带解析问题的 `unreadable`；`profile` 文档是 Profile 存在的标志）、**按给出的顺序**写入、`watch`、`sync`、`resolveConflict`。**不检查任何规则** | `profile-store-git`（1.13）、将来的 `profile-store-cloud`、本包的内存后端 |
| `ProfileStore` | 上层代码用的接口（Supervisor、runtime、CLI、UI） | 只有 `createProfileStore(backend, options)` |

`createProfileStore` 执行**全部**规则，后端实现不需要、也不能自己实现：

- 每个文档按 schema 校验（`validateFile`，含迁移）；版本过新的文档报 `profile.version_too_new`，什么都不能写。
- Workspace id 不重复（`profile.workspace_already_registered`）；注销时一并删掉两端涉及它的概念链接，并返回删掉了哪些。
- 概念链接两端的 Workspace 都要已注册（`profile.link_workspace_not_registered`）。
- Profile 的 id 不能变（`profile.id_changed`）。
- 有未解决同步冲突的文档不能写（`profile.conflict_unresolved`）；读到本地版本，其他文档照常写。
- **写入顺序**：一次写入涉及多个文档时，`createProfileStore` 逐个检查所有顺序（最多 24 种），选一个让**每写完一个文档**之后的 Profile 都不多出跨文档问题的顺序，交给后端按这个顺序写。这样即使后端只能逐个文件原子写入，中途崩溃也总是留下合法的 Profile。顺序不是写死的。最终结果合法、但没有任何安全顺序的修改（比如一次保存里把 `math` 换成 `physics`，同时把链接从 `math` 改到 `physics`）报 `profile.no_safe_write_order`，什么都不写，可以分两步做。创建时 `profile` 文档最后写。
- 缺少的文档报 `profile.document_missing`；后端解析不了的文档带着它的错误码（比如 `yaml.syntax`）报 `profile.invalid`。
- **不让问题变多**：外部修改或解决冲突之后，跨文档的规则可能已经不满足。`load()` 照常成功，在 `issues` 里列出；之后的写入只要不引入新的问题就允许（所以总能修复）。

## 结果和错误

领域规则不允许时返回 `{ ok: false, error }`，什么都不写；`error.issues` 列出具体问题（带文档名和字段路径）。后端的 I/O 错误照常抛出。错误码见 `PROFILE_ERROR_CODES`。

## 并发

乐观并发：`load()` 返回不透明的 `revision`。

- `save(profile, { base })`：读取之后被改过时返回 `profile.modified_since_load`，不重试。
- 单步操作（`registerWorkspace`、`unregisterWorkspace`、`setConceptLinks`）遇到并发修改时自动重试：**每次都重新读取最新的 Profile，在它上面重新执行操作、重新检查全部规则**，不复用旧的副本。最多 `maxAttempts` 次（默认 `DEFAULT_MAX_ATTEMPTS` = 3），之后返回 `profile.modified_since_load`。

## 注入的函数

`profile` 不能用 Platform 的 Clock 和 IdGenerator，所以由调用方传入 `now()` 和 `generateId()`。返回值不是合格的 `IsoDateTime` / `Ulid` 时直接抛出，不会写出格式错误的数据。

## 同步

`syncStatus()` 返回 `{ remote, online, pendingChanges, lastSyncedAt, conflicts }`；`sync()` 返回拉取、推送和冲突的文档。离线时读写照常（不变量 11）。只有一边改过的文档直接拉取或推送；两边都改过且内容不同的文档成为冲突，用 `resolveConflict(document, 'local' | 'remote')` 解决。现在按文档整体处理冲突，比如两台设备离线时各自注册了不同的 Workspace，也会在 `workspaces.yaml` 上冲突（8.1 会自动合并不重叠的修改）。

`watch()` 的事件（`{ document, source: 'local' | 'external' | 'sync' }`）只是提示，收到后重新 `load()`。

## 内存实现（测试用）

`createMemoryProfileStore({ now, generateId, remote? })` 返回 `{ store, backend }`。多个后端共用一个 `MemoryProfileRemote` 就是多台设备；`backend.setOnline(false)` 模拟断网，`backend.editExternally(document, data)` 模拟别的程序直接改了文件。

## 契约测试（`@mastery/profile/contract`）

```ts
import { describeProfileStoreContract } from '@mastery/profile/contract';

describeProfileStoreContract('git', () => ({ store, editExternally }), {
  sync: () => ({ a, b }), // 可选：支持同步时提供两台共用远程的设备
});
```

基本部分所有实现都要通过；同步部分在提供 `sync` 时运行（Git 实现在 8.1 之前不同步）。依赖 vitest（可选的 peerDependency），只在测试里使用。

不在本包：`learner-model/`（M8）、`skills/`（4.6）。
