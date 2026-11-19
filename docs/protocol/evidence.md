# evidence/&lt;slug&gt;/&lt;ULID&gt;.json

一次掌握程度的证明记录。**只追加**：任何代码路径都不能修改或删除已有的 Evidence（不变量 2）。agent 通过 `submitEvidence()` 提交，由 Mastery Core 写入。JSON Schema：[schemas/evidence.schema.json](schemas/evidence.schema.json)。示例：[examples/evidence.json](examples/evidence.json)（来自评测会话）、[examples/evidence-manual.json](examples/evidence-manual.json)（手动录入）。

| 字段 | 说明 |
|---|---|
| `schema_version` | `1` |
| `id` | ULID，和文件名一致 |
| `concept_id` | 对应的 Concept |
| `session_id` | 来自哪次评测会话；手动录入时为 `null`（必须写出来） |
| `assessment_type` | `independent_verification` / `practice` / `self_assessment`，权重从高到低 |
| `criteria_version` | 评测时使用的 criteria 版本 |
| `dimensions` | 五个维度的得分，`0..1` 或 `null`（没测过） |
| `confidence` | 置信度，`0..1` |
| `evaluator` | `{ kind: agent, id: <插件名>, model: <provider>:<model> }` 或 `{ kind: human }` |
| `note` | 备注；手动录入时写明来由，有会话时可以是 `null`（必须写出来） |
| `created_at` | 创建时间 |

Evidence 里的分数由会话里各题的分数汇总而来，汇总规则属于规则包（2.3）和 Evaluator Agent（5.2）。

## JSON Schema 检查不了的规则

- 五个维度不能全是 `null`。
- `session_id` 为 `null` 时，`note` 必须是非空字符串。
- `criteria_version` 和 criteria 的版本一致、会话存在：由 Mastery Core 在提交时检查（2.2）。
