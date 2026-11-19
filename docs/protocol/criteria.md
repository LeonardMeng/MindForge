# assessments/&lt;slug&gt;/criteria.yaml

某个 Concept 的评测标准，带版本号。用户可以编辑，agent 通过 Proposal（`criteria.set`）修改。JSON Schema：[schemas/criteria.schema.json](schemas/criteria.schema.json)。

| 字段 | 必填 | 说明 |
|---|---|---|
| `schema_version` | 是 | `1` |
| `concept_id` | 是 | 对应的 Concept（slug），和目录名一致 |
| `version` | 是 | 标准的版本（≥1 的整数）；含义变化时升版本，每条 Evidence 记录评测时用的版本 |
| `dimensions` | 是 | 五个维度都写出来；每个维度是 `{ focus, threshold }`，不考察的维度写 `null` |

- `focus`：考察要点，不能为空列表，不能重复。
- `threshold`：达标阈值，`0..1`。

```yaml
schema_version: 1
concept_id: self-attention
version: 2
dimensions:
  recall: { focus: [写出注意力公式], threshold: 0.8 }
  understanding:
    focus: [解释 Q、K、V 的作用, 解释为什么要除以 √d]
    threshold: 0.7
  reasoning: null
  application: { focus: [手算一个 2×2 的例子], threshold: 0.6 }
  transfer: null
```

## JSON Schema 检查不了的规则

- 至少要考察一个维度（五个不能全是 `null`）。
- `concept_id` 和目录名一致。由 `mastery validate` 检查。
