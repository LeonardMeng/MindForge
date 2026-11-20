# @mastery/rules-v1

掌握度规则 v1（ROADMAP 2.3、2.4）。依赖：`schema`、`core`（只用规则接口的类型）。参数和理由见 [ADR-0007](../../docs/adr/ADR-0007-rules-v1-parameters.md)，**暂定**，M5 检查点后复审；改参数要发布新的规则版本。

```ts
import { rulesV1 } from '@mastery/rules-v1';

const aggregate = rulesV1.aggregate(evidence); // { dimensions, confidence, perDimension }
```

## 导出

| 名字 | 说明 |
|---|---|
| `rulesV1` | `Rules` 对象，`version: 1`，注册到 RulesRegistry 用 |
| `aggregateV1(evidence)` | 维度聚合（2.3） |
| `V1_PARAMETERS` | 冻结的参数：`halfWeightDays: 30`、`typeWeights`（1.0 / 0.6 / 0.3）、`decimals: 4` |

## 维度聚合

每个维度只看给它打了分的证据（`null` 不参与，没有这样的证据时是 `null`）：

1. 权重 = `H / (H + ageDays)` × 类型权重。`ageDays` 从**这个维度**最新的证据算起（不是 `now`），所以投影不随日期变化，别的维度的新证据也不影响它。
2. 分数 = 加权平均。
3. 维度置信度 = `C / (C + 1)` × (`1 − 2 × 加权平均绝对偏差`)，`C` = Σ 权重 × 证据的 `confidence`。
4. 总置信度 = 有分数的维度的置信度的平均；没有证据时为 0。

不同 criteria 版本的证据一起聚合。只用加减乘除和绝对值（不用 `exp`、`pow`、`sqrt`，它们在规范里是近似的），证据先按 id 排序再求和，输出四舍五入到 4 位小数，不会出现 `-0`。

## 测试

- 表格驱动的场景（期望值用分数精确算出，再舍入）。
- fast-check 属性：只有 `null` 的维度仍是 `null`；所有数在 0..1 之间、不是 `-0`、最多 4 位小数；打乱证据顺序结果不变；加一条不给某维度打分的证据，那个维度不变；算两次字节相同。
