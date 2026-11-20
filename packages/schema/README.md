# @mastery/schema

Mastery OS 的文件协议：zod schema、推导出的 TypeScript 类型，以及结构化的校验错误。

纯定义：不依赖任何内部包，不做 I/O，不依赖 Node（ADR-0012）。所有包都可以依赖它，包括 `ui-*`。

## 校验入口

```ts
import { ConceptFrontmatter, formatSchemaIssue, validate } from '@mastery/schema';

const result = validate(ConceptFrontmatter, data);
if (!result.success) {
  for (const issue of result.issues) console.log(formatSchemaIssue(issue));
  // prerequisites: must be a list, for example prerequisites: [probability]
}
```

推荐用 `validate()`。直接用 `schema.safeParse()` 再 `toSchemaIssues()` 也可以，但 zod 默认不报告输入值，缺少字段时只能报成 `field.invalid_type`，不能报成 `field.required`。

## 公共类型

| 名称 | 规则 |
|---|---|
| `SchemaVersion` | 大于等于 1 的整数（各文件 schema 目前只接受 `1`） |
| `Slug` | `^[a-z0-9]+(-[a-z0-9]+)*$`，长度 1–64 |
| `GlobalConceptRef` | `<workspace-id>:<slug>`，两部分都遵守 `Slug` 规则；配套 `parseGlobalConceptRef` / `formatGlobalConceptRef` |
| `Ulid` | 26 个字符的 Crockford Base32，**只接受大写**，第一个字符 0–7 |
| `IsoDateTime` | 只有一种写法：`YYYY-MM-DDTHH:mm:ssZ`（UTC，没有毫秒和时区偏移），日期必须真实存在 |
| `DimensionScore` | `0..1` 的有限数，或 `null`（没测过） |
| `DimensionScores` | 五个维度（`DIMENSIONS`）必须全部写出，不允许其他字段 |

`Slug`、`GlobalConceptRef`、`Ulid`、`IsoDateTime` 是 branded 类型，只能通过 `parse` 得到，互相不能混用。

## 文件 schema

| 名称 | 文件 | 要点 |
|---|---|---|
| `WorkspaceConfig` | `workspace.yaml` | `schema_version`、`id`、`name`、`plugins` 必填，`description` 可选。插件名是 Slug，前面可加 `~` 表示禁用；配置必须是对象（没有配置写 `{}`），内容由插件自己校验；同一插件不能同时以 `x` 和 `~x` 出现。SuperAgent 也是普通插件，没有单独的字段；插件配置里不能有密钥（1.11） |
| `ProjectConfig` | `projects/<slug>/project.yaml` | `schema_version`、`id`、`name`、`status`（`active` / `paused` / `completed` / `archived`）、`concepts`（可以是 `[]`，不能重复）必填，`description` 可选 |
| `ConceptFrontmatter` | `concepts/<slug>.md` 的 frontmatter | `schema_version`、`id`、`name`、`prerequisites`（只能是本 Workspace 的 slug，可以是 `[]`，不能重复，不能包含自己）、`status`（`draft` / `active` / `archived`）必填；`tags`、`aliases` 可选，只接受列表 |
| `Criteria` | `assessments/<slug>/criteria.yaml` | `schema_version`、`concept_id`、`version`（≥1）、`dimensions` 必填；五个维度写全，每个维度是 `{ focus: [考察要点], threshold: 0..1 }` 或 `null`（不考察）；`focus` 不能为空列表；至少考察一个维度 |
| `AssessmentSession` | `assessments/<slug>/sessions/<ULID>.json` | 完成时一次写入，只追加。`started_at` ≤ `completed_at`；`items` 不能为空，每道题有 `dimensions`、`question`、`answer`（可以是空字符串）、`rationale`、`scores`（五个维度写全，有分数的维度必须在这道题的 `dimensions` 里）。会话里不记录 Evidence 的 id |
| `Evidence` | `evidence/<slug>/<ULID>.json` | 只追加。`session_id` 和 `note` 必须写出来，可以是 `null`；`session_id` 为 `null`（手动录入）时 `note` 必须写明来由；五个维度不能全是 `null`；`evaluator` 是 `{ kind: agent, id, model: "<provider>:<model>" }` 或 `{ kind: human }` |
| `MasteryProjection` | `mastery/<slug>.yaml` | 派生数据，不带计算时间。`state`（六个状态之一）、`dimensions`、`confidence`、`review_due_at`（只有 `mastered` 有，2.7）、`rules_version`、`evidence_ids`（升序、不重复）、`explanation`（`[{ code, params }]`，code 由规则包定义） |
| `MasteryHistoryEntry` | `mastery/history/<slug>.jsonl` 的一行 | 每行都带 `schema_version`；`cause` 是 `evidence`（`at` = 证据时间）、`time`（`at` = 算出的到期时刻）或 `rules` |
| `Blindspot` | `blindspots/<ULID>.yaml` | `type`（knowledge / reasoning / application / prerequisite / retention）、`status`（suspected / confirmed / resolved / merged；`resolved` 表示缺口已补上，`merged` 表示并入了另一个盲区）、`merged_into`（必须写出来：`merged` 时是并入的盲区，不能是自己，其他状态为 `null`）、`description`、`prerequisite_id`（必须写出来：`type` 为 prerequisite 时是缺失的前置 Concept，其他类型为 `null`）、`evidence_ids`（升序、不重复，可以是 `[]`）、`source` |
| `Intervention` | `interventions/<ULID>.yaml` | `blindspot_id`、`method`（explanation / socratic / practice / counterexample）、`content`、`status`（planned / completed / abandoned）、`closed_at`（planned 时为 `null`，否则为结束时间）、`source`；不写 `concept_id` |
| `Proposal` | 存放位置待定（4.2 / 6.8） | agent 或用户提交的一组变更操作（`PROPOSAL_OPERATIONS`），更新类操作给出完整的新内容；**没有删除操作**，只能通过状态归档；`requires_approval` 只是提交者的请求，Core 只能把它从 `false` 升级为 `true` |
| `ProfileConfig` | Profile 的 `profile.yaml` | `id`（ULID）、`name`、`language`（BCP 47，只有一种大小写写法，比如 `zh-CN`）、`weekly_minutes`（0–10080，或 `null`）。目标暂不在这里（7.4） |
| `WorkspaceRegistry` | Profile 的 `workspaces.yaml` | `workspaces: [{ id, name, remote }]`，id 不重复；`remote` 必须写出（可以是 `null`），不能是本机路径，`http(s)://` 不能带任何用户信息，`ssh://` 不能带密码 |
| `ConceptLinks` | Profile 的 `concept-links.yaml` | `links: [{ from, relation: requires, to }]`，两端是 `GlobalConceptRef`，必须在不同的 Workspace，不能指向自己，不能重复 |
| `ProfileDefaults` | Profile 的 `defaults.yaml` | `plugins`（规则同 `workspace.yaml`）、`model`（`ModelRef` 或 `null`）；不能有密钥 |
| `DeviceConfig` | `~/.mastery/device.yaml` | 字段见 README 第 7 节，所有段都必须写出；`workspaces.<id>.checkout` 必须写出；本机路径必须是绝对路径；`models` 的两项同时有值或同时为 `null`；**不能有密钥** |
| `parseConceptBody()` | `concepts/<slug>.md` 的正文 | 解析 `## Description` 和 `## Learning Objectives`（只认这两个英文二级标题）；识别 ``` 和 ~~~ 代码块；缺少或重复的章节给警告 |

### 约定

- **对象一律严格校验**：出现未知字段就报 `field.unknown`。格式演进靠 `schema_version` 和迁移（ADR-0005）。
- **两个例外**：
  - `ConceptFrontmatter` 为了兼容 Obsidian，未知字段原样保留，`conceptFrontmatterWarnings()` 给出 `concept.unknown_field` 警告；
  - `WorkspaceConfig.plugins` 里每个插件的配置对象原样保留，不校验内容。
- **列表只有一种写法**：写成单个字符串（比如 `tags: ml`）会报 `field.expected_list`，提示改成 `tags: [ml]`。
- **来源 `Actor`**：`{ kind: agent, id, model: "<provider>:<model>" }` 或 `{ kind: human }`，用于 Evidence 的 `evaluator` 和其他实体的 `source`。
- **按某个字段区分的对象**（`Actor` 的 `kind`、历史的 `cause`、Proposal 操作的 `op`）：区分字段缺失报 `field.required`，取值不对报 `field.invalid_option`，分支里的错误照常报。
- **跨字段检查在字段本身没有错误时才运行**：比如“`prerequisites` 不能包含自己”，要等列表里没有格式错误和重复项以后才会检查。

## 密钥检查（`secrets.ts`）

`DeviceConfig`、`ProfileDefaults`、`WorkspaceRegistry` 和 `WorkspaceConfig` 在校验之前先找密钥（任意深度）：

- 字段名拆词后含有 `token`、`secret`、`password`、`passwd`、`apikey`、`credential`，或者 `api` + `key`、`private` + `key`：`secret.field_not_allowed`（提示用钥匙串，无害的名字改个名）。整词比较，所以 `max_tokens` 不算。
- 值像常见的 token（GitHub `ghp_` 等、`github_pat_`、`sk-` / `sk-ant-`、`AKIA…`、`-----BEGIN … PRIVATE KEY-----`）：`secret.value_not_allowed`，参数里不带值本身。
- 找到密钥时只报密钥的错误。导出的 JSON Schema 不受影响。

**这只是一道保险，不是安全边界**：真正的规则是密钥只放在系统钥匙串里。Concept 的 frontmatter 不检查。

## 结构化错误

每条错误（和警告）都是 `SchemaIssue`：`{ code, path, params, message }`。

- `code` 是稳定的错误码，不随 zod 版本变化。zod 自带的错误被映射成：
  - `field.required`：缺少字段；
  - `field.invalid_type`：类型不对，参数里带期望类型和实际类型；
  - `field.unknown`：多余字段，每个字段一条；
  - `field.invalid_option`：不在可选值里；
  - `field.invalid`：其他。
- `message` 由英文消息表生成，不含字段路径；`formatSchemaIssue()` 把路径加在前面，写法如 `prerequisites[1]`、`plugins["~agent-x"]`。
- 测试只断言错误码，不断言提示文字。
- 错误码按它描述的概念命名（如 `actor.invalid_model`、`field.not_sorted`），不按第一个用到它的实体命名（ADR-0013）。

## 版本和迁移

- 每种文件在 `src/file-kinds.ts` 的登记表 `FILE_KINDS` 里登记一次：schema、当前版本、位置、迁移步骤。当前版本号定义在 `src/versions.ts`。
- `migrate(kind, data)`：从任意旧版本逐级升级到当前版本，只在内存里，不改写磁盘。版本过新时返回 `migration.version_too_new`，这样的文件只能读，不能修改或覆盖。
- `validateFile(kind, data)`：先迁移，再按当前 schema 校验，读文件时用它。结果里的 `from < to` 说明这是旧格式的文件。
- 加迁移的步骤和规则见 [`docs/adding-a-migration.md`](../../docs/adding-a-migration.md)。每一步迁移都必须配上永久保留的旧版本样例测试。

## JSON Schema 和协议文档

`pnpm --filter @mastery/schema gen` 先构建，再运行 `scripts/gen-json-schema.mjs`，把所有文件 schema 导出为 JSON Schema（draft 2020-12，按输出端导出），写到 `docs/protocol/schemas/`。CI 会重新生成并检查和提交的文件是否一致，所以修改 schema 后要重新运行 `gen` 并提交结果。协议说明页在 `docs/protocol/`。

- `src/constraints.ts` 集中定义所有正则和数值范围。`.check()` 用它们校验，`.meta()` 用它们写进 JSON Schema，两边不能各写各的。
- JSON Schema 只能检查单个字段的格式；跨字段规则写在各说明页的“JSON Schema 检查不了的规则”一节里。

## 测试工具

`src/testing.ts` 提供 `slug()`、`ulid()`、`globalConceptRef()`、`isoDateTime()` 等简短的构造函数，内部仍然经过 `parse`，不合法时抛错。只给测试和 fixture 用，不从 `src/index.ts` 导出。
