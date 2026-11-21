# @mastery/core

Mastery Core（ADR-0002）：纯领域逻辑。不依赖 Cordis，不做 I/O，不用 `node:*`；只依赖 `schema` 和 `platform` 的**类型**（dependency-cruiser 检查，`tests/dependency-rules.test.ts` 有样例）。

2.1 是端口、结果类型、领域错误和领域事件；2.2 起是领域操作（`submitEvidence`）。

## 端口（`Ports`）

| 端口 | 说明 |
|---|---|
| `repository: Repository` | Core 看到的 Workspace 数据。实现：`@mastery/core-store` 的 `createStoreRepository`（2.2）、测试用的 `@mastery/core/testing` |
| `clock: Clock` | `@mastery/platform` 的 Clock（只用类型）；时间只从这里来（不变量 3） |
| `events: EventSink` | 领域事件的出口 |
| `rules: RulesRegistry` | `get(version)` 和 `current()`；`Rules` 见下 |

### Rules

规则包（比如 `@mastery/rules-v1`）实现的接口：`version`，以及 `aggregate(evidence)`，返回 `Aggregate`：

- `dimensions`：五个维度的分数，没有证据给某个维度打分时为 `null`；
- `confidence`：总的置信度，没有证据时为 0；
- `perDimension`：每个维度的 `{ score, confidence, evidenceCount }`，没有分数时为 `null`（2.4 写 explanation 用）。

`evaluate(evidence, criteria)` 返回 `Evaluation`：`state`、`aggregate`（全部证据的聚合）、`explanation`（`[{ code, params }]`，code 由规则包定义）和 `steps`（按 `(created_at, id)` 顺序每条证据一步：`from`、`to`、`evidenceId`、`at`、到这一步的 `dimensions` 和 `confidence`，2.5 据此推导历史）。

两个方法都必须是纯函数：不读时钟，证据的顺序不影响结果，同样的输入逐字节相同（不变量 3）。`evaluate` 的阈值来自当前的 criteria。

### Repository

只有 2.2 和 2.5 需要的操作，以后的任务需要时再加：`getConcept`、`getCriteria`、`getSession`、`listEvidence`、`appendEvidence`（只追加）、`getMastery`、`writeMastery`、`getHistory`、`writeHistory`（历史是派生数据，整个写出，2.5）。

- 读一个文件返回 `found` / `missing` / `unreadable`（`tooNew` 表示是更新版本写的）。
- **`listEvidence` 不会悄悄丢掉用不了的文件**：返回 `{ items, tooNew, unreadable }`，能用的证据按 id 升序，版本过新的、读不了的单独列出。2.5 据此决定能不能重算（有版本过新的证据时不重算）。
- 文件格式问题作为结果返回；I/O 错误照常抛出。

## 结果和错误

`Result<T, E>` 是 `{ ok: true, value } | { ok: false, error }`，用 `ok()`、`err()` 构造。领域规则不允许的情况用它返回，不抛出。

领域错误是普通数据 `{ code, params, message, issues }`，不是异常。`message` 只从消息表生成（ADR-0013），测试只断言 `code`。类型名和 ROADMAP 一致：`ConceptNotFound`、`ConceptUnreadable`、`ConceptArchived`、`CriteriaNotFound`、`CriteriaUnreadable`、`CriteriaVersionMismatch`、`DimensionNotAssessed`、`SessionNotFound`、`SessionUnreadable`、`SessionMismatch`、`SessionAlreadyUsed`、`EvidenceBeforeSession`、`EvidenceInFuture`、`EvidenceAlreadyExists`、`EvidenceInvalid`、`RulesVersionUnknown`、`EvidenceVersionTooNew`。

## 提交证据：`submitEvidence(ports, input)`

`input` 是未校验的数据（Agent 或 `mastery evidence add` 给的 JSON）。返回 `Result<Evidence, SubmitEvidenceError>`；**这里不算掌握度**，投影由 2.5 根据全部证据重算。

按顺序检查，第一个不通过的检查决定错误，**拒绝时什么都不写**（不变量 9，`@mastery/core-store` 用真实的 store 测试）：

| 检查 | 错误码 |
|---|---|
| 符合 schema（错误的 `file` 是 `EVIDENCE_INPUT_FILE`，即 `<input>`） | `core.evidence_invalid` |
| `created_at` 不比 `clock.now()` 晚超过 `EVIDENCE_CLOCK_TOLERANCE_MS`（5 分钟，刚好 5 分钟可以） | `core.evidence_in_future` |
| Concept 存在、读得了、不是 `archived`（`draft` 和 `active` 都接受） | `core.concept_not_found`、`core.concept_unreadable`、`core.concept_archived` |
| 评测标准存在、读得了、版本相同 | `core.criteria_not_found`、`core.criteria_unreadable`、`core.criteria_version_mismatch` |
| 证据打分的维度都是标准考察的维度 | `core.dimension_not_assessed` |
| 有 `session_id` 时：会话存在、读得了 | `core.session_not_found`、`core.session_unreadable` |
| 会话的 `concept_id`、`criteria_version` 和证据相同，证据打分的维度在会话里都有分数 | `core.session_mismatch`（`field` 是 `concept_id`、`criteria_version` 或 `dimensions`） |
| 证据不早于会话完成的时间（同一秒可以） | `core.evidence_before_session` |
| 一个会话只产生一条证据（1.3） | `core.session_already_used` |
| 写入：同一个 id 不存在 | `core.evidence_already_exists` |

- 会话按证据的 Concept 目录查找，所以真实的 store 里别的 Concept 的会话是 `session_not_found`；放错目录、`concept_id` 不对的会话文件是 `session_unreadable`（store 的路径检查）。`concept_id` 的检查是防御性的，用替换了 `getSession` 的 Repository 测试。
- “会话已经用过”现在扫一遍 `listEvidence`，只看得到读得了的证据（3.x 改由索引回答）。
- 写入成功后发出 `evidence/submitted`，`at` 是 `clock.now()`。

## 重算：`recalculate(ports, conceptId)`

读取 Concept（归档的也重算）、criteria 和全部证据，用 `rules.current()` 判定，写出投影 `mastery/<slug>.yaml` 和**由证据推导的历史** `mastery/history/<slug>.jsonl`（`deriveHistory`：第一步一条，之后 `state`、`dimensions` 或 `confidence` 变了的每一步一条）。返回 `{ projection, projectionWritten, changed, historyWritten }`。

| 情况 | 结果 |
|---|---|
| 有更新版本写的证据 / 读不了的证据 | `core.evidence_version_too_new` / `core.evidence_unreadable`，什么都不写（绝不退回 `not_assessed`） |
| 已有投影是更新的规则算的 | `core.rules_version_unknown`（不降级） |
| 投影或历史文件是更新版本写的 | `core.mastery_version_too_new` |
| 投影或历史读不了 | 直接覆盖（派生数据） |
| 没有证据文件，也没有投影 | 什么都不写，`projection: null` |
| 没有证据文件，但有投影 | 写成 `not_assessed` |

投影按值比较：值变了才写、才发出 `mastery/changed`；只是格式不同时写回规范形式，不发事件。历史每次都和推导结果对齐，字节相同时不写，所以两次写之间崩溃后再算一次就能补齐。不读时钟；多个进程同时重算需要 4.1 的写锁。

## 前置依赖风险：`prerequisiteRisks(ports, conceptId)`

只读。沿前置依赖**传递地**按广度优先往下找，返回有风险的前置 Concept `{ conceptId, depth, via, reason }`，按 `(depth, conceptId)` 排序。每个 Concept 只报一次，用最短的路径（同样长时按 slug 的字典序取第一条）；`via` 是中间经过的 Concept。

- **风险**（`reason`）：状态是 `not_assessed`、`diagnosed`、`learning`、`needs_review`（`RISKY_STATES`；没有投影算作 `not_assessed`）；`review_due`（`mastered` 但按 `clock.now()` 已经到期复习，2.7，不剪枝）；`concept_missing`（引用的 Concept 不存在）；`concept_unreadable`（不知道它的前置依赖，不再往下找）；`mastery_unreadable`（`tooNew` 表示是更新版本写的）。
- **剪枝**：`provisional_mastery` 和没到期的 `mastered` 的前置 Concept 不报，也不往下找。已经验证过的掌握说明它的基础是够的，不剪枝的话图越大噪音越多。它下面的 Concept 如果还能通过别的、没被剪掉的路径到达，照样会报。只在安全的状态剪枝：有风险的、投影读不了的节点照样往下找。
- **新鲜度**：状态来自保存的投影，结果只和投影一样新；`recalculate` 和启动时的对账（3.x）负责让投影保持最新。是否到期在读取时按 `clock.now()` 判断。
- 被查询的 Concept 本身不存在或读不了时返回 `core.concept_not_found` / `core.concept_unreadable`。有环时也会停下（`mastery validate` 会报环）。

## 复习：`reviewStatus(projection, now)`

纯函数（2.7）。投影的 `review_due_at` 由规则根据证据算出（只有 `mastered` 有）；“现在是否到期”只在读取时推导：返回 `{ dueAt, due, effectiveState }`，`now` 不早于 `dueAt` 时 `due` 为 true，`effectiveState` 是 `needs_review`。保存的投影不变，保存的 `needs_review` 只来自证据。status、UI、Supervisor 和 `prerequisiteRisks` 都用它。

## 领域事件

`evidence/submitted`、`mastery/changed`，按 `type` 区分。

- 只在写入成功之后发出。
- **事件可能丢失**（比如写入之后、发出之前崩溃了），使用者必须能根据文件重新对账，和 FileSystem 的 `watch` 一样。
- Core 用 `publish(sink, event)` 发出：监听者抛出的错误交给 `sink.reportError`，不会改变操作的结果，也不会撤销已经完成的写入；`reportError` 自己出错也被忽略。

## 测试工具和契约测试

- `@mastery/core/testing`：`createMemoryRepository()`（内存 Repository，store 的规则在这里同样成立：校验、路径和内容一致、只追加、版本过新只读）、`createEventRecorder()`、`createRulesRegistry()`（2.8 起也从 `@mastery/core` 导出，CLI 用它注册规则包）、`stubRules(version)`（`aggregate` 总是返回“没有分数”，`evaluate` 总是 `not_assessed`，给不关心规则结果的测试用）。
- `@mastery/core/contract`：`describeRepositoryContract(name, () => ({ repository, seed }))`。内存实现和 `createStoreRepository` 都要通过，测试用的假实现不会和真实的实现走样。依赖 vitest（可选的 peerDependency）。
