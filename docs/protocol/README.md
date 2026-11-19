# 文件协议

Mastery OS 的数据都是普通文件。本目录说明每种文件的格式，不打开应用也能读懂、校验自己的数据。

- `schemas/`：从 `@mastery/schema` **自动生成**的 JSON Schema（draft 2020-12），不要手工修改。重新生成：`pnpm --filter @mastery/schema gen`。CI 会检查提交的文件是否和生成结果一致。
- `examples/`：JSON 格式的完整示例，由测试自动校验。
- 每种文件一页说明（下表）。

| 文件 | 说明页 | 谁来写 | 能否修改 |
|---|---|---|---|
| `workspace.yaml` | [workspace.md](workspace.md) | 用户 | 可以编辑 |
| `projects/<slug>/project.yaml` | [project.md](project.md) | 用户 | 可以编辑 |
| `concepts/<slug>.md` | [concept.md](concept.md) | 用户；agent 通过 Proposal | 可以编辑（外部修改会被重新校验） |
| `assessments/<slug>/criteria.yaml` | [criteria.md](criteria.md) | 用户；agent 通过 Proposal | 可以编辑；改变含义时升 `version` |
| `assessments/<slug>/sessions/<ULID>.json` | [assessment-session.md](assessment-session.md) | Mastery Core | **只追加**，完成时一次写入 |
| `evidence/<slug>/<ULID>.json` | [evidence.md](evidence.md) | Mastery Core | **只追加**，不能修改或删除 |
| `mastery/<slug>.yaml`、`mastery/history/<slug>.jsonl` | [mastery.md](mastery.md) | 只有 Mastery Core | **派生数据**；历史只追加 |
| `blindspots/<ULID>.yaml` | [blindspot.md](blindspot.md) | Mastery Core（来自 Proposal）、用户 | 可以修改（状态会变化） |
| `interventions/<ULID>.yaml` | [intervention.md](intervention.md) | Mastery Core（来自 Proposal）、用户 | 可以修改（状态会变化） |
| Proposal（存放位置待定） | [proposal.md](proposal.md) | agent、用户 | 提交后不修改 |

Profile 和 Device 的格式在任务 1.11 加入。

## 所有文件共同的规则

这些规则来自 [ADR-0013](../adr/ADR-0013-file-format-conventions.md)：**同一个值只有一种写法**。

- 每个结构化文件都带 `schema_version`，目前都是 `1`。旧版本的文件先在内存里迁移再校验，只有执行 `mastery migrate` 时才改写磁盘（ADR-0005）。`schema_version` 比当前版本还新的文件，是新版本的 Mastery OS 写的，只能读，不能修改。
- **slug**：小写字母、数字和单个连字符，长度 1–64，例如 `self-attention`。
- **ULID**：26 个字符，**只用大写**，例如 `01JD3K8Q8Z6V7X2N4M5P9R0T1W`。
- **时间**：只用 UTC，格式固定为 `YYYY-MM-DDTHH:mm:ssZ`，不带毫秒和时区偏移，例如 `2026-11-19T10:00:00Z`。
- **五个维度**（`recall`、`understanding`、`reasoning`、`application`、`transfer`）出现时必须全部写出；没测过写 `null`，和 `0`（测过、得分为零）不同。
- 写成“可以是 `null`”的字段也**必须写出来**，不能省略。
- 列表不能写成单个字符串（`tags: ml` 要写成 `tags: [ml]`）。
- 对象一律严格校验，出现未知字段就报错。例外：Concept 的 frontmatter，以及 `workspace.yaml` 里每个插件的配置。

## JSON Schema 和 `mastery validate` 的区别

JSON Schema 只能检查单个字段的格式。下面这些由 `mastery validate` 检查，JSON Schema 不检查，以 `mastery validate` 的结果为准：

- 每页“JSON Schema 检查不了的规则”一节里列出的跨字段规则；
- 时间格式正确、但日期不存在的情况（比如 `2026-02-30T00:00:00Z`）；
- 引用的东西是否存在（前置 Concept、盲区、证据等）、`id` 是否和文件名一致。

`mastery validate` 的报错都带稳定的错误码（比如 `slug.invalid_format`）和字段路径，见 `packages/schema/README.md`。
