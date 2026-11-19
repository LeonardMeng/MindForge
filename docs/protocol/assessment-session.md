# assessments/&lt;slug&gt;/sessions/&lt;ULID&gt;.json

一次完成的评测会话。由 Mastery Core 在会话完成时**一次写入**，之后只追加、不修改；中途放弃的会话不保存。JSON Schema：[schemas/assessment-session.schema.json](schemas/assessment-session.schema.json)。示例：[examples/assessment-session.json](examples/assessment-session.json)。

| 字段 | 说明 |
|---|---|
| `schema_version` | `1` |
| `id` | 会话的 ULID，和文件名一致 |
| `concept_id` | 评测的 Concept |
| `criteria_version` | 使用的 criteria 版本 |
| `started_at`、`completed_at` | 开始和完成时间 |
| `items` | 题目列表，不能为空 |

每道题（`items` 的一项）：

| 字段 | 说明 |
|---|---|
| `dimensions` | 这道题考察的维度，不能为空、不能重复 |
| `question` | 题目，不能为空 |
| `answer` | 学习者的回答；什么都没答时是空字符串 |
| `rationale` | 评分理由，不能为空 |
| `scores` | 这道题的原始分数，五个维度写全 |

会话写完就不能再改，所以每道题的分数必须在这里记下来：以后改评分汇总方式，可以用这些原始记录重算。

一次会话只对应一条 Evidence。会话里**不记录** Evidence 的 id，由 Evidence 通过 `session_id` 指回会话，关联关系只存一处。

## JSON Schema 检查不了的规则

- `completed_at` 不能早于 `started_at`。
- 每道题里，分数不为 `null` 的维度必须在这道题的 `dimensions` 里（考察了但没法评分的维度可以是 `null`）。
