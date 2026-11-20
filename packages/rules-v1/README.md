# @mastery/rules-v1

掌握度规则 v1（ROADMAP 2.3、2.4）。依赖：`schema`、`core`（只用规则接口的类型）。参数和理由见 [ADR-0007](../../docs/adr/ADR-0007-rules-v1-parameters.md)，**暂定**，M5 检查点后复审；改参数要发布新的规则版本。

```ts
import { rulesV1 } from '@mastery/rules-v1';

const aggregate = rulesV1.aggregate(evidence); // { dimensions, confidence, perDimension }
const result = rulesV1.evaluate(evidence, criteria); // { state, aggregate, explanation, steps }
result.explanation.map(formatExplanation); // 英文
```

## 导出

| 名字 | 说明 |
|---|---|
| `rulesV1` | `Rules` 对象，`version: 1`，注册到 RulesRegistry 用 |
| `aggregateV1(evidence)` | 维度聚合（2.3） |
| `evaluateV1(evidence, criteria)` | 状态机（2.4） |
| `conditionsOf(evidence, criteria)`、`isPassingVerification(e, criteria)` | 条件 P、M 和“通过的独立验证”，测试和 2.5 的诊断用 |
| `formatExplanation(item)`、`EXPLANATION_CODES` | explanation 的英文消息表 |
| `V1_PARAMETERS` | 冻结的参数：`halfWeightDays: 30`、`typeWeights`（1.0 / 0.6 / 0.3）、`decimals: 4`、`minIndependentVerifications: 2`、`minVerificationGapDays: 7` |

## 维度聚合

每个维度只看给它打了分的证据（`null` 不参与，没有这样的证据时是 `null`）：

1. 权重 = `H / (H + ageDays)` × 类型权重。`ageDays` 从**这个维度**最新的证据算起（不是 `now`），所以投影不随日期变化，别的维度的新证据也不影响它。
2. 分数 = 加权平均。
3. 维度置信度 = `C / (C + 1)` × (`1 − 2 × 加权平均绝对偏差`)，`C` = Σ 权重 × 证据的 `confidence`。
4. 总置信度 = 有分数的维度的置信度的平均；没有证据时为 0。

不同 criteria 版本的证据一起聚合。只用加减乘除和绝对值（不用 `exp`、`pow`、`sqrt`，它们在规范里是近似的），证据先按 id 排序再求和，输出四舍五入到 4 位小数，不会出现 `-0`。

## 状态机

按 `(created_at, id)` 的顺序重放证据，每条一步（`steps` 记录前后状态、证据 id、时间和到这一步的聚合）。条件和迁移表见 ADR-0007 的“状态机（2.4）”：

- **通过的独立验证**：当前 criteria 版本、给考察的维度打了分、都达到阈值。
- **P**：考察的维度都达到阈值（没测过算没达到），至少 1 次通过的独立验证。
- **M**：P，至少 2 次通过的独立验证，相隔至少 7 天，每个考察的维度都被某次通过的独立验证打过分。
- 进入 `mastered` 总是要求这一步的证据本身是一次通过的独立验证。
- 到期复习不在这里（2.7）。

## 测试

- 表格驱动的场景（期望值用分数精确算出，再舍入）。
- 状态机：每条迁移路径（包括跳过的和退步再恢复的），条件的边界（间隔 7 天减 1 秒、覆盖、transfer、旧 criteria 版本、没通过的独立验证），explanation 的内联快照（每个状态，代码和英文）。
- 状态机的 fast-check 属性：顺序不影响结果；聚合和 2.3 相同；步骤从 `not_assessed` 连成一串到最终状态；`mastered` 时 M 一定成立；`needs_review` 只出现在 `mastered` 之后；explanation 的 code 都在消息表里；两次字节相同。
- 聚合的 fast-check 属性：只有 `null` 的维度仍是 `null`；所有数在 0..1 之间、不是 `-0`、最多 4 位小数；打乱证据顺序结果不变；加一条不给某维度打分的证据，那个维度不变；算两次字节相同。
