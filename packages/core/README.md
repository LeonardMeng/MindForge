# @mastery/core

Mastery Core（ADR-0002）：纯领域逻辑。不依赖 Cordis，不做 I/O，不用 `node:*`；只依赖 `schema` 和 `platform` 的**类型**（dependency-cruiser 检查，`tests/dependency-rules.test.ts` 有样例）。

2.1 只有端口、结果类型、领域错误和领域事件，逻辑从 2.2 开始。

## 端口（`Ports`）

| 端口 | 说明 |
|---|---|
| `repository: Repository` | Core 看到的 Workspace 数据。实现：`@mastery/core-store` 的 `createStoreRepository`（2.2）、测试用的 `@mastery/core/testing` |
| `clock: Clock` | `@mastery/platform` 的 Clock（只用类型）；时间只从这里来（不变量 3） |
| `events: EventSink` | 领域事件的出口 |
| `rules: RulesRegistry` | `get(version)` 和 `current()`；`Rules` 在 2.3 补全，现在只有 `version` |

### Repository

只有 2.2 和 2.5 需要的操作，以后的任务需要时再加：`getConcept`、`getCriteria`、`getSession`、`listEvidence`、`appendEvidence`（只追加）、`getMastery`、`writeMastery`、`getHistory`、`appendHistory`。

- 读一个文件返回 `found` / `missing` / `unreadable`（`tooNew` 表示是更新版本写的）。
- **`listEvidence` 不会悄悄丢掉用不了的文件**：返回 `{ items, tooNew, unreadable }`，能用的证据按 id 升序，版本过新的、读不了的单独列出。2.5 据此决定能不能重算（有版本过新的证据时不重算）。
- 文件格式问题作为结果返回；I/O 错误照常抛出。

## 结果和错误

`Result<T, E>` 是 `{ ok: true, value } | { ok: false, error }`，用 `ok()`、`err()` 构造。领域规则不允许的情况用它返回，不抛出。

领域错误是普通数据 `{ code, params, message, issues }`，不是异常。`message` 只从消息表生成（ADR-0013），测试只断言 `code`。类型名和 ROADMAP 一致：`ConceptNotFound`、`ConceptUnreadable`、`CriteriaNotFound`、`CriteriaVersionMismatch`、`SessionNotFound`、`SessionMismatch`、`EvidenceAlreadyExists`、`EvidenceInvalid`、`RulesVersionUnknown`、`EvidenceVersionTooNew`。

## 领域事件

`evidence/submitted`、`mastery/changed`，按 `type` 区分。

- 只在写入成功之后发出。
- **事件可能丢失**（比如写入之后、发出之前崩溃了），使用者必须能根据文件重新对账，和 FileSystem 的 `watch` 一样。
- Core 用 `publish(sink, event)` 发出：监听者抛出的错误交给 `sink.reportError`，不会改变操作的结果，也不会撤销已经完成的写入；`reportError` 自己出错也被忽略。

## 测试工具和契约测试

- `@mastery/core/testing`：`createMemoryRepository()`（内存 Repository，store 的规则在这里同样成立：校验、路径和内容一致、只追加、版本过新只读）、`createEventRecorder()`、`createRulesRegistry()`。
- `@mastery/core/contract`：`describeRepositoryContract(name, () => ({ repository, seed }))`。内存实现和 `createStoreRepository` 都要通过，测试用的假实现不会和真实的实现走样。依赖 vitest（可选的 peerDependency）。
