# mastery/&lt;slug&gt;.yaml 和 mastery/history/&lt;slug&gt;.jsonl

掌握度投影和它的历史。**只有 Mastery Core 能写**（不变量 4），手工修改会被重算覆盖。

## 投影：mastery/&lt;slug&gt;.yaml

根据全部证据和版本化的规则算出的当前掌握度。同一组证据加同一版本的规则，投影逐字节相同（不变量 3），所以**不带计算时间**。合并冲突时由 merge driver 根据证据重算（ADR-0006）。JSON Schema：[schemas/mastery-projection.schema.json](schemas/mastery-projection.schema.json)。

| 字段 | 说明 |
|---|---|
| `schema_version` | `1` |
| `concept_id` | 对应的 Concept |
| `state` | `not_assessed` / `diagnosed` / `learning` / `provisional_mastery` / `mastered` / `needs_review` |
| `dimensions` | 五个维度的掌握度，`0..1` 或 `null` |
| `confidence` | 置信度，`0..1` |
| `rules_version` | 计算用的规则版本 |
| `evidence_ids` | 参与计算的证据，**升序**、不重复 |
| `explanation` | 为什么是这个状态、还差什么：`[{ code, params }]`，code 由规则包定义 |

```yaml
schema_version: 1
concept_id: self-attention
state: provisional_mastery
dimensions: { recall: 0.9, understanding: 0.85, reasoning: 0.8, application: 0.7, transfer: null }
confidence: 0.82
rules_version: 1
evidence_ids: [01JD3K8Q8Z6V7X2N4M5P9R0T1W, 01JD5M0A0A0A0A0A0A0A0A0A0A]
explanation:
  - { code: state.provisional_mastery, params: {} }
  - { code: met.independent_verifications, params: { count: 1 } }
  - { code: missing.independent_verifications, params: { have: 1, need: 2 } }
```

## 历史：mastery/history/&lt;slug&gt;.jsonl

**派生数据**，和投影一样只由 Mastery Core 写出：每次重算都根据全部证据、当前的 criteria 和规则重新推导，整个文件原子地写出，内容没变时不写（ROADMAP 2.5）。它**不是只追加的**：通常只是在末尾多出几行，但较早的证据晚到时（比如从另一台设备同步过来）、规则或 criteria 变了时，中间的行也会变。同样的证据、criteria 和规则得到逐字节相同的历史（不变量 3），所以合并冲突时 merge driver 可以重算它（3.7）。

**历史描述的是证据所表明的路径，不是应用当时显示过什么；后者记录在 Git 的提交历史里。**

一行一次掌握度变化，每一行都带 `schema_version`。规则的判定按 `(created_at, id)` 的顺序逐条处理证据：第一条证据一行，之后 `state`、`dimensions` 或 `confidence` 变了的每条证据一行。JSON Schema（一行）：[schemas/mastery-history-entry.schema.json](schemas/mastery-history-entry.schema.json)。示例：[examples/mastery-history-entry.json](examples/mastery-history-entry.json)。

字段：`schema_version`、`at`、变化后的 `state`、`dimensions`、`confidence`、`rules_version`，以及变化的原因 `cause`：

| `cause` | `at` 取什么 |
|---|---|
| `{ kind: evidence, evidence_id }` | 这条证据的 `created_at` |
| `{ kind: time }` | 算出来的到期时刻。schema 保留，现在不写（到期复习是否进入历史由 2.7 决定） |
| `{ kind: rules }` | schema 保留，现在不写：规则升级后整个历史按新规则重新推导，每一行的 `rules_version` 都是当前版本 |

`at` 由证据推导，不取“发现变化的时间”。

## JSON Schema 检查不了的规则

- `evidence_ids` 必须是升序。
- 历史的行按 `(at, cause.evidence_id)` 的顺序（由推导保证）。
