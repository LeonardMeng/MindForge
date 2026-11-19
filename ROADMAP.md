# Mastery OS Roadmap

> 本文件是 AI 编码助手和人共用的任务清单。**一次会话做一个任务编号**。
> 架构、依赖规则和不变量见 [`README.md`](./README.md)。

## 怎么使用本文件

**每个任务都包含：**

- **包**：要改动的包。只能改这里列出的包，以及 ROADMAP 本身。
- **依赖**：必须先完成的任务。
- **产出**：要交付的东西。
- **验收**：可以用命令验证的完成标准。全部满足才算完成。
- **不做**：明确不在这个任务范围内的事，防止越界。

**状态标记：** `[ ]` 未开始 · `[~]` 进行中 · `[x]` 已完成 · `[!]` 被阻塞（写明原因）

**每次会话的开场提示词（复制使用）：**

```text
读 README.md 和 ROADMAP.md。我们做任务 <编号>。
先确认它的依赖都已完成，然后用 plan mode 给出方案：要新建/修改的文件、
要写的测试、有没有和 README 冲突的地方。我确认后再开始写代码。
完成后运行 pnpm check，并在 ROADMAP 里勾选任务、填写完成记录。
```

**审查强度：** 标 🔍 的任务决定数据格式或核心逻辑，人要逐行审查。其余任务可以只看测试和结果。

---

## 当前状态

- **当前里程碑：** M1
- **下一个任务：** 1.7
- **阻塞项：** 无

---

## M0 · 仓库和护栏

> 目标：在写任何业务代码之前，先让规则能被自动检查。

### [x] 0.1 Monorepo 骨架
- **包**：根目录
- **依赖**：无
- **产出**：pnpm workspace、`tsconfig.base.json`（strict、`noUncheckedIndexedAccess`）、Vitest 根配置、eslint + prettier、`pnpm build/test/lint/check` 脚本、一个空的示例包 `packages/_template`（含 `src/index.ts`、`package.json`、`tsconfig.json`、一个测试）。`CLAUDE.md` 指向 README 和 ROADMAP。
- **验收**：`pnpm install && pnpm check` 通过；复制 `_template` 就能建新包。
- **不做**：任何业务代码。

### [x] 0.2 依赖边界检查
- **包**：根目录
- **依赖**：0.1
- **产出**：dependency-cruiser 配置，覆盖 README 第 6 节的全部规则（包括禁止 `node:*` 和禁止 `cordis`），接入 `pnpm lint`。
- **验收**：在 `_template` 里故意 import `node:fs`，`pnpm lint` 报错；删掉后通过。规则配置里每一条都有注释，对应 README 的条目。
- **不做**：其他 lint 规则。

### [x] 0.3 CI
- **包**：`.github/workflows/`
- **依赖**：0.2
- **产出**：在 PR 上运行 `pnpm check`；Linux、macOS、Windows 三个平台的矩阵测试。
- **验收**：推送 `task/0.3-ci` 分支后，三个平台的 CI 都是绿色。
- **不做**：发布流程、Rust 构建（M6 再加）。

### [x] 0.4 ADR 模板和首批决策
- **包**：`docs/adr/`
- **依赖**：0.1
- **产出**：ADR 模板；把下方“决策记录”里已经定下的决策各写成一份 ADR。
- **验收**：ADR-0001 到 ADR-0006 都存在，格式统一。
- **不做**：未决问题的 ADR。

---

## M1 · 文件协议

> 目标：只用命令行就能创建、校验一个 Workspace。**这是整个项目里最难改的一部分。**

### [x] 1.1 🔍 Schema：公共部分和 ID
- **包**：`schema`
- **依赖**：0.2
- **产出**：`SchemaVersion`、`Slug`（规则：小写字母、数字、连字符，长度 1–64）、`GlobalConceptRef`（`<ws>:<slug>`）、`Ulid`、`IsoDateTime`、`DimensionScores`（五个维度，值为 `0..1 | null`）。
- **验收**：每个类型都有合法和非法样例的测试；`null` 和 `0` 在 `DimensionScores` 里被区分。
- **不做**：具体的实体 schema。

### [x] 1.2 🔍 Schema：Workspace、Project、Concept
- **包**：`schema`
- **依赖**：1.1
- **产出**：`WorkspaceConfig`（含 `plugins` 字段，支持 `~` 前缀禁用）、`ProjectConfig`、`ConceptFrontmatter`；Concept 正文约定的章节（Description、Learning Objectives）解析规则。
- **验收**：用 README 第 7 节的示例作为测试样例，全部能通过校验；缺少 `id`、`prerequisites` 不是数组等错误都给出可读的报错信息（带字段路径）。
- **不做**：读写文件。

### [x] 1.3 🔍 Schema：Criteria、Session、Evidence、Mastery
- **包**：`schema`
- **依赖**：1.1
- **产出**：`Criteria`（含 `version`、各维度的考察要点和阈值）、`AssessmentSession`、`Evidence`、`MasteryProjection`（含 `state`、`dimensions`、`confidence`、`rules_version`、`evidence_ids`、`explanation`）、`MasteryHistoryEntry`。
- **验收**：每个 schema 都有样例测试；`MasteryState` 是六个状态的枚举。
- **不做**：计算逻辑。

### [x] 1.4 Schema：Blindspot、Intervention、Proposal
- **包**：`schema`
- **依赖**：1.1
- **产出**：`Blindspot`（类型：knowledge / reasoning / application / prerequisite / retention；状态：suspected / confirmed / resolved / merged）、`Intervention`、`Proposal`（一组变更操作 + 来源 + 是否需要人工审批）。
- **验收**：样例测试通过。
- **不做**：审批流程。

### [x] 1.5 JSON Schema 导出和协议文档
- **包**：`schema`、`docs/protocol/`
- **依赖**：1.2、1.3、1.4
- **产出**：`pnpm --filter @mastery/schema gen` 把所有 zod schema 导出为 JSON Schema，写到 `docs/protocol/`；为每种文件写一页简短说明。
- **验收**：生成的文件和提交的文件一致（CI 检查，防止忘记重新生成）。
- **不做**：网站。

### [x] 1.6 Schema 迁移框架
- **包**：`schema`
- **依赖**：1.5
- **产出**：`migrate(kind, data)`：从任意旧版本逐级升级到最新版本；版本过新时给出明确错误。用一个只在测试里存在的假迁移链（v1 → v2 → v3）做测试（`schema_version` 从 1 开始，没有 v0）。
- **验收**：迁移链测试通过；未知版本报错。
- **不做**：改写磁盘文件。

### [ ] 1.7 Platform 端口和内存实现
- **包**：`platform`、`platform-memory`
- **依赖**：0.2
- **产出**：接口 `FileSystem`（read / write / rename / list / stat / remove / mkdir / watch）、`Clock`、`IdGenerator`、`Lock`；内存实现，可以模拟写入中途崩溃。
- **验收**：一套通用的“契约测试”，内存实现能通过（后面的 Node 和 Tauri 实现也要跑同一套测试）。
- **不做**：SQLite 和 Git 端口（在 M3 加）。

### [ ] 1.8 Node 平台实现
- **包**：`platform-node`
- **依赖**：1.7
- **产出**：基于 `node:fs` 的实现，原子写使用“临时文件 + rename”。
- **验收**：通过 1.7 的契约测试；三个平台的 CI 都通过。
- **不做**：文件监听的防抖优化。

### [ ] 1.9 🔍 Store
- **包**：`store`
- **依赖**：1.2、1.3、1.4、1.7
- **产出**：按类型读写所有实体（frontmatter 解析、YAML、JSON）；读的时候做校验和迁移；写的时候做原子写，并保持 YAML 的字段顺序稳定（减少 diff 噪音）；Evidence 只提供 `append`，没有 `update`。
- **验收**：读后再写，文件逐字节不变；Evidence 写入已存在的 ID 会被拒绝；模拟崩溃后不会留下半截文件（不变量 2、6）。
- **不做**：索引、Git。

### [ ] 1.10 示例 Workspace
- **包**：`fixtures/ws-transformers/`
- **依赖**：1.9
- **产出**：8–10 个 Concept（matrix-multiplication、probability、softmax、embedding、self-attention、multi-head-attention、positional-encoding、transformer…），带前置依赖；其中 3 个有 criteria；几篇带 wikilink 的笔记。
- **验收**：用 store 读取全部文件，没有校验错误。
- **不做**：Evidence（M2 再加）。

### [ ] 1.11 🔍 Schema：Profile 和 Device
- **包**：`schema`
- **依赖**：1.1
- **产出**：`ProfileConfig`（profile.yaml）、`WorkspaceRegistry`（workspaces.yaml）、`ConceptLinks`、`ProfileDefaults`、`DeviceConfig`（device.yaml，字段见 README 第 7 节）。`DeviceConfig` 的校验要拒绝任何看起来像密钥的字段（`api_key`、`token`、`password`、`secret`）。
- **验收**：README 里的示例都能通过校验；含密钥字段的 device.yaml 被拒绝。
- **不做**：读写逻辑。

### [ ] 1.12 🔍 ProfileStore 端口和 Profile 领域逻辑
- **包**：`profile`
- **依赖**：1.11
- **产出**：`ProfileStore` 接口（load / save / registerWorkspace / unregisterWorkspace / listWorkspaces / getConceptLinks / setConceptLinks / watch / sync 状态）；Profile 领域规则：Workspace id 全局唯一、注销 Workspace 时清理相关的概念链接；一个内存实现用于测试。接口的设计要能同时容纳 Git 和将来的云服务（同步状态、冲突、离线标记）。
- **验收**：一套 ProfileStore 契约测试，内存实现通过；dependency-cruiser 确认 `profile` 不依赖 `git`、`store`、`node:*`。
- **不做**：Git 实现、云实现。

### [ ] 1.13 profile-store-git
- **包**：`profile-store-git`
- **依赖**：1.12、1.9
- **产出**：基于文件的 ProfileStore 实现（此时只做文件读写；Git 提交在 3.6 完成后接入）。
- **验收**：通过 1.12 的契约测试。
- **不做**：远程同步。

### [ ] 1.14 Device
- **包**：`device`
- **依赖**：1.11、1.7
- **产出**：读写 `~/.mastery/device.yaml`；首次运行生成设备 ULID；`SecretStore` 端口（钥匙串）及内存实现；对照 Profile 的 `workspaces.yaml` 计算本机 Workspace 状态（已拉取 / 未拉取 / 已注销但本地还在）。
- **验收**：三种状态各有测试；device.yaml 丢失后能根据 Profile 重新生成；device.yaml 不会出现在任何 Git 仓库里（测试 `init` 生成的 `.gitignore` 和 Profile 目录）。
- **不做**：真实的系统钥匙串实现（M6 在 Tauri 里实现，CLI 端用 keytar 或同等方案）。

### [ ] 1.15 CLI：profile、init 和 validate
- **包**：`cli`
- **依赖**：1.8、1.9、1.13、1.14
- **产出**：
  - `mastery profile init [dir]`：创建 Profile 和 device.yaml；
  - `mastery profile show`：显示 Profile 和本机 Workspace 状态；
  - `mastery init <dir>`：生成 Workspace 目录结构、`workspace.yaml`、`.gitignore`、`.gitattributes`，并**注册到当前 Profile**、写入 device.yaml；没有 Profile 时报错并提示先运行 `mastery profile init`；
  - `mastery validate <dir>`：校验全部文件，检查引用（前置依赖是否存在，有没有循环依赖）。`validate` 不需要 Profile（不变量 14）。
- **验收**：`profile init` → `init` → `validate` 走通；没有 Profile 时 `init` 失败并给出提示；对 fixture 运行 `validate` 通过（不需要 Profile）；人为制造循环依赖时报错并给出依赖环路径。
- **不做**：交互式向导。

> **🏁 M1 检查点：** 人手动用这套格式写几天笔记和 Concept，确认格式顺手了再继续。发现问题就回头修改 schema，这时候改代价最小。

---

## M2 · Mastery Core

> 目标：只用命令行就能“记录证据 → 看到掌握度”。这是产品的灵魂。

### [ ] 2.1 🔍 Core 端口和错误模型
- **包**：`core`
- **依赖**：1.9
- **产出**：`Ports` 接口（Repository、Clock、EventSink、RulesRegistry）；`Result<T, E>` 类型；领域错误类型（`ConceptNotFound`、`CriteriaVersionMismatch`、`EvidenceAlreadyExists`…）；领域事件类型。
- **验收**：只有类型和最小测试；dependency-cruiser 确认没有 import `cordis` 或 `node:*`。
- **不做**：逻辑。

### [ ] 2.2 🔍 提交证据
- **包**：`core`
- **依赖**：2.1
- **产出**：`submitEvidence()`：校验 Concept 是否存在、criteria 版本是否匹配、会话是否存在；通过后追加写入并发出 `evidence/submitted` 事件。
- **验收**：每一种拒绝情况都有测试；校验失败时内存文件系统里没有任何变化（不变量 9）。
- **不做**：重新计算掌握度。

### [ ] 2.3 🔍 规则接口和规则 v1：维度聚合
- **包**：`core`（接口）、`rules-v1`（实现）
- **依赖**：2.1
- **产出**：`Rules` 接口；v1 的维度聚合：按时间衰减加权、按评测类型加权（独立验证 > 练习 > 自评）、`null` 不参与平均、置信度随证据数量和一致性变化。
- **验收**：用表格驱动测试覆盖至少 15 个场景；用 fast-check 做属性测试：只有 `null` 的维度结果仍是 `null`；分数在 0..1 之间；证据顺序打乱不改变结果。
- **不做**：状态迁移。

### [ ] 2.4 🔍 规则 v1：状态机
- **包**：`rules-v1`
- **依赖**：2.3
- **产出**：六个状态之间的迁移条件，例如 `provisional_mastery → mastered` 要求至少两次独立验证、其中一次 transfer 达到阈值、两次间隔至少 N 天；每次判定都生成 `explanation`（为什么是这个状态，还差什么）。
- **验收**：每条迁移路径都有测试；`explanation` 有快照测试。
- **不做**：复习调度。

### [ ] 2.5 🔍 重算和投影
- **包**：`core`
- **依赖**：2.2、2.4
- **产出**：`recalculate(conceptId)`：读取全部证据，按规则算出投影；只在结果变化时写入 `mastery/<slug>.yaml`、追加历史、发出 `mastery/changed` 事件。
- **验收**：确定性测试：同样的输入算两次，输出逐字节相同（不变量 3）；没有变化时不写文件。
- **不做**：跨 Concept 的传播。

### [ ] 2.6 前置依赖风险
- **包**：`core`
- **依赖**：2.5
- **产出**：`prerequisiteRisks(conceptId)`：找出前置 Concept 中状态为 `not_assessed`、`learning`、`needs_review` 的，作为风险返回。
- **验收**：用 fixture 的依赖图测试。
- **不做**：跨 Workspace（M8）。

### [ ] 2.7 复习调度
- **包**：`core`、`rules-v1`
- **依赖**：2.5
- **产出**：`scheduleReview()`：根据状态和最近证据的时间算出下次复习日期（v1 用简单的间隔递增即可）；到期的 `mastered` 转为 `needs_review`。
- **验收**：用假时钟测试一年内的复习序列。
- **不做**：通知。

### [ ] 2.8 CLI：证据和状态
- **包**：`cli`
- **依赖**：2.5、2.7
- **产出**：`mastery evidence add`（从 JSON 文件或命令行参数读取）、`mastery recompute [concept]`、`mastery status [concept]`（表格显示维度、状态和 explanation）、`mastery due`（列出到期需要复习的概念）。
- **验收**：在 fixture 的副本上走通完整流程；给 fixture 补充 Evidence 样例数据。
- **不做**：交互式评测（M5）。

---

## M3 · 索引和 Git

### [ ] 3.1 SQLite 端口和 Node 实现
- **包**：`platform`、`platform-node`、`platform-memory`
- **依赖**：1.8
- **产出**：`Database` 端口（exec / query / transaction）；Node 实现用 better-sqlite3；内存实现用 sql.js 或同等方案。
- **验收**：契约测试通过。
- **不做**：业务表。

### [ ] 3.2 索引：建表和全量重建
- **包**：`index`
- **依赖**：3.1、1.9
- **产出**：Concept、关系、Evidence、掌握度、笔记的表；FTS5 全文检索；`rebuild()`。
- **验收**：不变量 1：删除索引、重建后，一组标准查询的结果和之前一致。
- **不做**：增量更新。

### [ ] 3.3 索引：wikilink 和增量更新
- **包**：`index`
- **依赖**：3.2
- **产出**：解析 `[[slug]]` 和 `[[slug|别名]]`；反向链接查询；根据文件变化事件做增量更新。
- **验收**：增量更新后的结果和全量重建一致（属性测试：随机修改序列）。
- **不做**：文件监听本身（由 Platform 提供）。

### [ ] 3.4 CLI：reindex 和 search
- **包**：`cli`
- **依赖**：3.3
- **产出**：`mastery reindex`、`mastery search <词>`、`mastery links <concept>`。
- **验收**：对 fixture 运行，结果符合预期。
- **不做**：向量检索。

### [ ] 3.5 Git 端口和 Node 实现
- **包**：`platform`、`platform-node`
- **依赖**：1.8
- **产出**：`Git` 端口（init / status / add / commit / log / diff / merge / remote 操作）；Node 实现调用系统 git。
- **验收**：在临时目录里的契约测试通过。
- **不做**：gitoxide（M6）。

### [ ] 3.6 事务提交
- **包**：`git`
- **依赖**：3.5、2.5
- **产出**：`Transaction`：把一次领域事务涉及的文件一起提交，message 和 trailer 符合 README 第 8 节；可以按 trailer 查询历史。
- **验收**：一次评测会话正好产生一个 commit；`git log` 能按 `Mastery-Concepts` 过滤。
- **不做**：自动同步。

### [ ] 3.7 🔍 merge driver
- **包**：`git`、`cli`
- **依赖**：3.6
- **产出**：`mastery merge-driver %O %A %B %P`：合并时根据证据重算投影；`mastery init` 时自动注册 driver。
- **验收**：用两个 clone 分别追加证据再合并，没有冲突，投影等于用全部证据重算的结果。
- **不做**：Concept 文本冲突的处理（M9）。

---

## M4 · 运行时和插件

### [ ] 4.1 Runtime：Root 和 Workspace fork
- **包**：`runtime`
- **依赖**：0.2
- **产出**：创建 Root Context；`openWorkspace(path)` 创建 fork，`closeWorkspace` 销毁它；`platform` 作为服务注入。
- **验收**：打开、关闭 100 次后没有残留的监听器和定时器（泄漏测试）。
- **不做**：Loader。

### [ ] 4.2 🔍 plugin-core：knowledge 服务
- **包**：`plugin-core`
- **依赖**：4.1、2.5、3.3、3.6
- **产出**：把 Core、store、index、git 组装成 `knowledge` 服务：查询接口 + `submitProposal()` + `submitEvidence()`；领域事件桥接到 `ctx.emit`；保护机制：第三方插件不能替换 `knowledge`。
- **验收**：Proposal 校验失败时文件不变；尝试用第三方插件替换 `knowledge` 时被拒绝。
- **不做**：审批 UI。

### [ ] 4.3 Loader 和热重载
- **包**：`runtime`
- **依赖**：4.1
- **产出**：根据 `workspace.yaml` 的 `plugins` 加载插件，支持 `~` 禁用；配置文件变化时只重载有变化的插件；插件配置用 schema 校验。
- **验收**：修改 YAML 后对应插件被卸载或重新加载，其他插件不受影响。
- **不做**：插件市场。

### [ ] 4.4 llm 服务、mock 和 Ollama provider
- **包**：`llm`、`providers/mock`、`providers/ollama`
- **依赖**：4.1
- **产出**：`llm` 服务：按 `provider:model` 选模型；chat、流式输出、结构化输出（按 zod schema 校验，失败时重试）；mock provider 可以预设回复；Ollama provider。
- **验收**：所有测试只用 mock；Ollama 有一个需要手动运行的集成测试。
- **不做**：云端 provider（M9）。

### [ ] 4.5 agents 注册表和运行日志
- **包**：`runtime`（或单独的 `agents-registry`）
- **依赖**：4.1
- **产出**：`agents.register({id, capabilities, run})`；`run(task)` 返回 Result + Proposals；每次运行的输入、输出、LLM 调用都记录到 `.mastery/runtime/runs/<ULID>.jsonl`。
- **验收**：插件卸载时自动注销 agent；日志可以回放。
- **不做**：调度策略。

### [ ] 4.6 Skill 加载
- **包**：`runtime`
- **依赖**：4.5
- **产出**：从 Workspace 和全局目录加载 `skills/*.md`（frontmatter + 正文），agent 可以按名字取用。
- **验收**：fixture 里的示例 skill 可以被读取。
- **不做**：skill 编辑器。

---

## M5 · 第一个学习闭环（MVP）

> 目标：在终端里完成“出题 → 作答 → 评分 → 记录证据 → 更新掌握度”。验证产品的核心假设。

### [ ] 5.1 Assessment Agent
- **包**：`agents/assessor`
- **依赖**：4.2、4.4、4.5
- **产出**：根据 criteria 为指定维度出题；优先使用陌生的例子（用于 transfer 维度）。
- **验收**：用 mock LLM 测试结构化输出；题目里带上它考察的维度。
- **不做**：题库。

### [ ] 5.2 🔍 Evaluator Agent
- **包**：`agents/evaluator`
- **依赖**：5.1
- **产出**：根据 criteria 给回答评分，输出五个维度（没考察到的维度为 `null`）、置信度和理由；作为 Evidence 提交。
- **验收**：mock 测试；评分结果通过 schema 校验；评分理由被保存在会话记录里。
- **不做**：多评委。

### [ ] 5.3 最小 SuperAgent
- **包**：`superagent`
- **依赖**：5.2
- **产出**：写死的流程：检查前置风险 → 出题 → 收集回答 → 评分 → 提交 → 重算 → 汇报。
- **验收**：用 mock 跑通整个流程，产生一个 commit。
- **不做**：自由规划（M7）。

### [ ] 5.4 CLI：交互式评测
- **包**：`cli`
- **依赖**：5.3
- **产出**：`mastery assess <concept>`：在终端里出题、作答、显示评分和新的掌握状态；`--provider` 选择模型。
- **验收**：人用本地 Ollama 实际跑一次。
- **不做**：UI。

> **🏁 M5 检查点（MVP）：** 人在 fixture 上真实地学习和评测一周。重点判断：评分可信吗？状态变化合理吗？`explanation` 有用吗？根据结论调整规则（可能需要规则 v2）之后再进入 UI。

---

## M6 · 桌面应用

### [ ] 6.1 Tauri 外壳
- **包**：`apps/desktop`
- **依赖**：M5
- **产出**：Tauri 2 项目、Vite + React、窗口和菜单；CI 加入 Rust 构建。
- **验收**：三个桌面平台都能启动。
- **不做**：业务功能。

### [ ] 6.2 Rust 插件：文件系统和文件监听
- **包**：`apps/desktop/src-tauri`、`platform-tauri`
- **依赖**：6.1
- **产出**：用 Rust 实现 FileSystem 端口（含原子写和 watch），TS 侧封装为 `platform-tauri`。
- **验收**：通过 1.7 的契约测试（在 Tauri 测试环境中运行）。
- **不做**：SQLite、Git。

### [ ] 6.3 Rust 插件：SQLite 和 Git
- **包**：`apps/desktop/src-tauri`、`platform-tauri`
- **依赖**：6.2
- **产出**：rusqlite + FTS5；gitoxide（不支持的操作用 libgit2 补充）。
- **验收**：通过 3.1 和 3.5 的契约测试。
- **不做**：远程认证 UI。

### [ ] 6.4 Runtime 运行在 Worker 里，以及 RPC
- **包**：`rpc`、`apps/desktop`
- **依赖**：6.3、4.2
- **产出**：Runtime 运行在 Web Worker 里；`rpc` 包定义类型化的请求和事件；UI 用 TanStack Query 订阅。
- **验收**：在 UI 里能列出 fixture 的 Concept。
- **不做**：界面设计。

### [ ] 6.5 UI 基础：ui-kit 和布局
- **包**：`ui-kit`
- **依赖**：6.4
- **产出**：shadcn/ui + Tailwind 主题、侧边栏布局、路由、Workspace 选择器、离线和远程服务状态指示。
- **验收**：可以打开和切换 Workspace。
- **不做**：移动端布局（M9）。

### [ ] 6.6 Concept 和笔记编辑
- **包**：`ui-editor`
- **依赖**：6.5
- **产出**：CodeMirror 6 编辑 Markdown；frontmatter 表单视图；wikilink 自动补全和跳转；保存前校验，错误内联显示。
- **验收**：在应用外部修改文件后，界面自动刷新。
- **不做**：所见即所得模式。

### [ ] 6.7 掌握度面板
- **包**：`ui-mastery`
- **依赖**：6.5
- **产出**：每个 Concept 的五维雷达图或条形图（`null` 有单独的样式）、状态、explanation、历史曲线、到期复习列表。
- **验收**：数据和 `mastery status` 的输出一致。
- **不做**：跨 Workspace 视图。

### [ ] 6.8 评测界面和审批队列
- **包**：`ui-assess`
- **依赖**：6.7
- **产出**：在界面里完成评测会话；待审批的 Proposal 列表，带 diff 预览，可以接受或拒绝。
- **验收**：完整走一次评测，产生 commit。
- **不做**：批量审批。

### [ ] 6.9 Agent 执行查看器
- **包**：`ui-agents`
- **依赖**：6.8
- **产出**：显示 agent 运行的步骤、LLM 调用、工具调用和产生的 Proposal；可以中断正在运行的任务。
- **验收**：能回看 5.3 产生的运行日志。
- **不做**：从中断处恢复。

### [ ] 6.10 概念关系图
- **包**：`ui-graph`
- **依赖**：6.7
- **产出**：React Flow 显示前置依赖图，节点按掌握状态着色，点击跳转。
- **验收**：fixture 的依赖图显示正确。
- **不做**：在图上直接编辑关系。

### [ ] 6.11 Git 操作界面
- **包**：`ui-git`
- **依赖**：6.8
- **产出**：学习历史时间线（按 commit 和 trailer）、查看 diff、恢复旧版本。
- **验收**：能回滚一次 Concept 的修改。
- **不做**：远程同步（M9）。

---

## M7 · 扩展智能

### [ ] 7.1 Blindspot 检测
- **包**：`agents/evaluator` 或新包 `agents/diagnoser`
- **依赖**：5.2
- **产出**：从评分理由和维度模式中识别盲区（例如：recall 高但 transfer 低 → application 类盲区），作为 Proposal 提交。
- **验收**：mock 测试覆盖每种盲区类型。

### [ ] 7.2 Teacher Agent 和 Intervention
- **包**：`agents/teacher`
- **依赖**：7.1
- **产出**：根据盲区类型选择教学方法（讲解、苏格拉底式提问、练习、反例），生成 Intervention；完成后触发验证。
- **验收**：一个完整的“盲区 → 干预 → 验证”闭环测试。

### [ ] 7.3 规划型 SuperAgent
- **包**：`superagent`
- **依赖**：7.2
- **产出**：根据用户目标和当前掌握情况选择 agent、制定步骤；计划在执行前展示给用户，用户可以修改。
- **验收**：同样的目标，在不同掌握状态下产生不同的计划。

### [ ] 7.4 Research 和 Planning Agent
- **包**：`agents/research`、`agents/planner`
- **依赖**：7.3
- **产出**：Research 先只搜索本地资源和笔记；Planner 根据复习调度和时间预算安排学习计划。
- **验收**：mock 测试。

### [ ] 7.5 Concept 发现
- **包**：`agents/discovery`
- **依赖**：7.3
- **产出**：从目标、问题、资源中提取候选 Concept 和前置关系，作为待审批的 Proposal。
- **验收**：对一篇示例论文生成的候选 Concept 合理（人工判断）。

---

## M8 · Supervisor 和多 Workspace

### [ ] 8.1 Profile 同步和新设备引导
- **包**：`profile-store-git`、`device`、`cli`
- **依赖**：M5、3.6
- **产出**：Profile 的 Git 提交和远程同步；`mastery profile clone <remote>`：在新设备上拉取 Profile，生成 device.yaml，列出可拉取的 Workspace 并按选择拉取。
- **验收**：在两台模拟设备之间同步 Profile，各自的 device.yaml 互不影响。

### [ ] 8.2 全局索引
- **包**：`profile`、`index`
- **依赖**：8.1
- **产出**：扫描所有已注册的 Workspace，生成 `~/.mastery/global.db`；可以重建。
- **验收**：删掉后重建，结果一致。

### [ ] 8.3 跨 Workspace 概念链接
- **包**：`profile`、`core`
- **依赖**：8.2
- **产出**：`concept-links.yaml`；`prerequisiteRisks` 支持跨 Workspace 的依赖。
- **验收**：数学 Workspace 里某个概念状态变差，会在 AI Workspace 的依赖风险里出现。

### [ ] 8.4 Supervisor
- **包**：`supervisor`
- **依赖**：8.3、7.3
- **产出**：把用户请求路由到合适的 Workspace；跨 Workspace 的复习排程；维护学习者画像。
- **验收**：一个跨学科的问题能被路由到正确的 Workspace。

### [ ] 8.5 全局视图 UI
- **包**：`ui-supervisor`
- **依赖**：8.4、6.7
- **产出**：所有 Workspace 的总览、今日复习、跨领域风险提醒。

---

## M9 · 同步、移动端和生态

### [ ] 9.1 远程同步
- 拉取 / 推送 / 状态显示；同步失败时不影响本地使用。

### [ ] 9.2 冲突解决界面
- Concept 和笔记的文本冲突用三方 diff 解决；掌握度投影冲突由 merge driver 自动处理。

### [ ] 9.3 云端 provider
- `providers/anthropic`、`providers/openai`；首次向云端发送数据前征求用户同意（不变量 10）；界面明确标识哪些任务需要远程服务。

### [ ] 9.4 移动端
- Tauri iOS 和 Android 构建；先做复习、做题、记笔记；响应式布局。

### [ ] 9.5 MCP 端点
- `packages/mcp`：以只读为主，开放查询 Concept 和掌握度；写入必须走 Proposal。

### [ ] 9.6 更多工具插件
- `tools/pdf`、`tools/python-sandbox`、`tools/web-search`。

### [ ] 9.7 profile-store-cloud（预留）
- 实现云端 ProfileStore：本地完整副本 + 后台同步；通过 1.12 的契约测试；提供 Git ↔ 云的导出和导入。

### [ ] 9.8 插件开发文档和模板
- `create-mastery-plugin` 脚手架；插件 API 文档。

---

## 决策记录

| # | 决策 | 状态 |
|---|---|---|
| [ADR-0001](docs/adr/ADR-0001-filesystem-is-source-of-truth.md) | 文件系统是权威数据源，SQLite 只是可重建的索引 | 已定 |
| [ADR-0002](docs/adr/ADR-0002-pure-core-cordis-shell.md) | 纯 Core + Cordis 插件外壳；`knowledge` 服务受保护 | 已定 |
| [ADR-0003](docs/adr/ADR-0003-io-via-platform-ports.md) | 所有 I/O 通过 Platform 端口；Runtime 在桌面和移动端都运行在 Web Worker 里 | 已定 |
| [ADR-0004](docs/adr/ADR-0004-workspace-repo-profile-device.md) | 一个 Workspace 对应一个 Git 仓库；**Profile 必需**，通过 `ProfileStore` 端口访问，现在用 Git 实现，将来可以换成云服务（必须保留本地完整副本）；设备配置放在不同步的 `device.yaml` | 已定 |
| [ADR-0005](docs/adr/ADR-0005-ids-and-schema-version.md) | Concept 用 slug + 全局前缀；其他实体用 ULID；每个文件都有 `schema_version` | 已定 |
| [ADR-0006](docs/adr/ADR-0006-mastery-projection-merge-driver.md) | 掌握度投影提交到 Git，冲突由 merge driver 重算解决 | 已定 |
| ADR-0007 | 规则 v1 的具体阈值和衰减参数 | 在 2.3、2.4 中决定，M5 检查点后复审 |
| ADR-0008 | Node 端的 Git 实现：继续调用系统 git，还是改用嵌入式实现 | 在 6.3 之后决定 |
| ADR-0009 | 首批支持的本地模型和硬件配置 | 在 4.4 中决定 |
| ADR-0010 | 移动端的最小可用功能 | 在 9.4 之前决定 |
| [ADR-0011](docs/adr/ADR-0011-tauri-isolation.md) | 只有 `platform-tauri` 和 `apps/desktop` 能调用 Tauri（`@tauri-apps/*`），`ui-*` 不依赖 Tauri，为将来的 Web 版留路 | 已定 |
| [ADR-0012](docs/adr/ADR-0012-schema-open-to-all-packages.md) | 所有包都可以依赖 `schema`，包括 `ui-*`（编辑器保存前要直接调用 schema 校验）；`ui-*` 的其他限制不变 | 已定 |
| [ADR-0013](docs/adr/ADR-0013-file-format-conventions.md) | 文件格式约定：同一个值只有一种写法；对象一律严格校验（两个例外）；结构化错误码；`schema` 的运行时代码只能依赖 `zod` | 已定 |

---

## 待整理

> AI 助手在任务中发现、但不属于当前任务的事项，记在这里，由人决定放进哪个任务。

- （来自 0.1）TypeScript 暂用 5.9。7.x（Go 原生实现）已发布，但 typescript-eslint 8.x 只支持 `<6.1`，tsup 的 `.d.ts` 生成也依赖 TS 的 JS API。等生态支持后再评估升级。
- （来自 0.1）Vitest 暂用 4.1、tsup 暂用 8.5，它们的新大版本（Vitest 5、tsup 9）都刚发布一个月左右，稳定后再评估。
- （来自 0.2）README 第 6 节依赖图里没有列出的包（platform-memory、platform-node、platform-tauri、llm、providers/*、superagent、supervisor、rpc、cli、mcp、tools/*、ui-kit 等）暂时只受“硬性禁止”约束，没有白名单。按 README 第 12 节第 10 条，在建这些包的任务里补上。
- （来自 0.2）测试同样不能用 `node:*`。将来测试要读 `fixtures/` 时，新建一个 `testkit` 包，作为唯一允许在测试里用 `node:*` 的例外，负责把 fixture 加载进 `platform-memory`。
- （来自 0.2）dependency-cruiser 只看 import，看不到全局对象：Tauri 的 `window.__TAURI__`（以及 Node 的 `process`、`Buffer`，目前只靠 `types: []` 在类型层面挡住）需要另外的检查，比如 eslint 的 `no-restricted-globals`。
- （来自 0.2）行内写法 `import { type X } from '…'` 会被 dependency-cruiser 当成“只引用类型”，但在 `verbatimModuleSyntax` 下运行时会留下一个空的副作用 import。可以考虑开启 eslint 的 `@typescript-eslint/no-import-type-side-effects`，统一写成 `import type`。
- （来自 1.1，2.7 处理）复习日期可能需要只有日期的类型 `IsoDate`（`YYYY-MM-DD`），到时再加。
- （来自 1.2，4.3 决定）插件名目前按 Slug 规则。第三方插件如果用 npm 的 scope 包名（比如 `@someone/agent-x`），插件名的规则要不要放宽；同一个插件要不要支持多个实例。
- （来自 1.3，3.7 处理）两台设备各自往同一个 `mastery/history/<slug>.jsonl` 末尾追加时，Git 文本合并会冲突。方向：让 history 也能逐字节确定，由 merge driver 根据证据重算（和投影一样），而不是做文本合并。`cause: rules`（规则升级）时 `at` 怎么确定，到 3.7 再决定。
- （来自 1.3）进行中的评测会话以后可以暂存在 `.mastery/runtime/` 里，用于崩溃后恢复，不进入权威数据。
- （来自 1.4，4.2 实现）Proposal 的 `requires_approval` 只是提交者的请求：Core 按规则判断，只能把 `false` 升级为 `true`，不能反过来。以后可以在 `workspace.yaml` 里让用户配置哪些操作需要审批，但用户配置也只能收紧，不能放宽 Core 的最低要求。
- （来自 1.4，4.2 处理）并发冲突：提案生成后、批准前文件已被改动时怎么办。可能需要在更新类操作里带上“提案时文件内容的哈希”。Proposal 不是长期保存的数据，到时再加字段代价很小。
- （来自 1.4）4.2：实现 `blindspot.merge`，检查 `merged_into` 指向的盲区存在，并且不形成链或循环。
- （来自 1.5）一致性测试：把 schema 现有的合法和非法样例，同时用 zod 和一个 JSON Schema 校验器（比如 ajv，只作为 devDependency，不违反 ADR-0013）各跑一遍，结果应该一致；因为跨字段规则而只被 zod 拒绝的样例，单独列出来并注明原因。
- （来自 1.5，1.9 之后）协议文档里的 YAML 示例还没有自动校验。1.9 选定 YAML 库以后，加一个测试校验 `docs/protocol/*.md` 里的 YAML 示例。
- （来自 1.5，1.9 选 YAML 库时注意）很多 YAML 库（比如 js-yaml 的默认模式）会把不加引号的 `2026-11-20T08:00:00Z` 转成 Date 对象。store 读写 YAML 时必须把时间保留为字符串，否则 `IsoDateTime` 校验不过，读后再写也无法逐字节不变。
- （来自 1.5，M6 之前不做）让 VS Code 这类编辑器在用户编辑 `workspace.yaml`、Concept 的 frontmatter 时，直接用 `docs/protocol/schemas/` 里的 JSON Schema 做自动补全和实时校验。
- （来自 1.6，1.9 实现）读到 `migration.version_too_new` 的文件时，这个文件只读，store 绝对不能修改或覆盖它。多台设备上的应用版本可能不同，旧版本的应用不能把新版本写的文件降级或写坏。
- （来自 1.6，1.9 实现）修改一个旧版本的可修改文件（比如 Blindspot）时，写回的是当前版本。这是正常保存，不违反 ADR-0005 的“只有 `mastery migrate` 才改写磁盘”，那条说的是不要在读的时候顺手改写。Evidence 这类只能追加的文件不会被修改，所以会一直保持原来的版本，直到用户运行 `mastery migrate`。
- （来自 1.6，2.5 实现）如果某个 Concept 有任何证据是 `version_too_new`，就不重算这个 Concept 的掌握度，也不写投影，并提示用户升级 Mastery OS。否则会因为漏算证据而写出错误的投影，再通过 Git 同步到其他设备。
- （来自 1.6，1.11 处理）Profile 和 Device 的几种文件也要登记进 `packages/schema/src/file-kinds.ts` 和 `versions.ts`。
- （来自 1.4，7.2 处理）验证证据和干预的关联：优先考虑在 Intervention 里记录验证证据的 id（Intervention 文件本来就可以修改），这样不用改 Evidence 的格式，关联关系也只存一处。
- （来自 1.4，8.3 决定）引入跨 Workspace 的前置依赖后，Blindspot 的 `prerequisite_id` 可能需要支持 `GlobalConceptRef`。
- （来自 1.1）`packages/schema/src/testing.ts` 的测试构造函数目前只在 schema 包内部使用。其他包的测试要用时，再决定放在哪里（比如 `testkit` 包），不从 schema 的公共 API 导出。

---

## 完成记录

> 每完成一个任务，追加一行：日期 · 任务编号 · 分支或 PR · 一句话说明 · 有没有遗留问题。

| 日期 | 任务 | PR | 说明 | 遗留问题 |
|---|---|---|---|---|
| 2026-11-19 | 0.1 | `task/0.1-monorepo-skeleton` | pnpm workspace、TS strict 配置、Vitest 根配置、eslint + prettier、根脚本、`packages/_template` 和 `docs/adding-a-package.md` | 无；版本升级事项见“待整理” |
| 2026-11-19 | 0.2 | `task/0.2-dependency-boundaries` | dependency-cruiser 覆盖 README 第 6 节全部规则（白名单、只引用类型、硬性禁止 1–5）并接入 `pnpm lint`；README 第 5、6、11、12 节同步更新 | 未列出包的白名单、全局对象检查等，见“待整理” |
| 2026-11-20 | 0.3 | PR #1（`task/0.3-ci`） | GitHub Actions：push 到任何分支和 PR 时，在 Linux、macOS、Windows 上运行 `pnpm check` 和 `pnpm build`；`.gitattributes` 统一 LF 换行。三个平台 CI 全部通过 | 无 |
| 2026-11-20 | 0.4 | `task/0.4-adr` | `docs/adr/TEMPLATE.md`；ADR-0001 至 0006、0011、0012（理由和否决方案来自建仓库前的设计讨论记录）；决策记录表加上链接和 ADR-0012；README 第 12.6 条补上模板路径 | 无 |
| 2026-11-20 | 1.1 | `task/1.1-schema-common` | 新建 `@mastery/schema`（依赖 zod 4.6）：`SchemaVersion`、`Slug`、`GlobalConceptRef`、`Ulid`、`IsoDateTime`、`DimensionScores` 等 branded schema；结构化错误码和英文消息表；测试用构造函数；116 个测试 | 1.2 要处理的例外、`IsoDate`、JSON Schema 等见“待整理” |
| 2026-11-20 | 1.2 | `task/1.2-schema-workspace-concept` | `WorkspaceConfig`、`ProjectConfig`、`ConceptFrontmatter`（未知字段原样保留并给警告）、`parseConceptBody()`（按行解析，识别代码块）；zod 自带错误映射成 `field.*` 错误码，新增 `validate()` 和 `formatSchemaIssue()`。**修改了 1.1 测试里 8 处断言**（经人确认）：`ids.test.ts` 3 处、`dimensions.test.ts` 4 处由 `zod.invalid_type` / `zod.unrecognized_keys` 改为 `field.invalid_type` / `field.unknown`，含义不变；`errors.test.ts` 1 处测试原本验证“zod 错误码加 `zod.` 前缀”，该行为已去掉，改为验证“映射成 `field.*` 错误码”。原因：错误码不再随 zod 版本变化。共 206 个测试 | 跨字段检查只在字段本身无错时运行（已写进包 README）；JSON Schema 和插件名规则见“待整理” |
| 2026-11-20 | ADR-0013 | `task/1.3-schema-evidence-mastery`（单独提交） | 文件格式约定写成 ADR-0013；dependency-cruiser 新增 `schema-runtime-only-zod`，README 第 6 节加硬性禁止第 6 条；确认 schema 没有依赖 ULID 库 | 无 |
| 2026-11-20 | 1.3 | `task/1.3-schema-evidence-mastery` | `Criteria`、`AssessmentSession`（每道题带原始 `scores`）、`Evidence`（`session_id`、`note` 必须写出，手动录入要写 `note`）、`MasteryProjection`（结构化 `explanation`，`evidence_ids` 升序）、`MasteryHistoryEntry`（`cause` 为 evidence / time / rules）；按 `kind` 区分的对象用自定义分发，保证缺字段报 `field.required`；README 第 7 节 Evidence 示例补上 `"note": null`；共 344 个测试 | history 的合并方式、进行中会话的暂存见“待整理” |
| 2026-11-20 | 1.4 | `task/1.4-schema-blindspot-proposal` | 公共的 `Actor`（`Evaluator` 复用它）；`Blindspot`（`prerequisite_id` 规则）、`Intervention`（`status` 和 `closed_at` 规则）、`Proposal`（8 种变更操作，没有删除；`requires_approval` 只是请求）；`taggedUnion` 支持任意区分字段；共 437 个测试 | 审批规则、并发冲突、merge 语义、验证证据关联等见“待整理” |
| 2026-11-20 | 1.4（补充） | `task/1.4-schema-blindspot-proposal` | Blindspot 增加状态 `merged` 和字段 `merged_into`（`merged` 时必须有值且不能指向自己，其他状态为 `null`）。错误码改名：`evaluator.invalid_model` → `actor.invalid_model`，`mastery.evidence_ids_not_sorted` → `field.not_sorted`，**修改了 4 处断言**（经人确认，含义不变）：1.3 的 `evidence.test.ts`、`mastery.test.ts` 各 1 处，1.4 的 `actor.test.ts`、`blindspot.test.ts` 各 1 处；`blindspot.test.ts` 里原来用 `merged` 作为非法状态的例子改用 `deleted`。ADR-0013 补充错误码命名规则。共 445 个测试 | 无 |
| 2026-11-20 | 1.5 | `task/1.5-json-schema-protocol-docs` | `pnpm --filter @mastery/schema gen` 把 11 个文件 schema 导出到 `docs/protocol/schemas/`（输出稳定）；正则和数值范围集中到 `constraints.ts`，`.check()` 和 `.meta()` 共用；协议说明页 11 页加索引，列出 JSON Schema 检查不了的规则；JSON 示例由测试校验；CI 检查生成结果和提交的一致；`.prettierignore` 忽略生成的文件；eslint 对 `.mjs` 脚本关闭类型感知规则；共 473 个测试 | YAML 示例校验、zod 与 JSON Schema 一致性测试等见“待整理” |
| 2026-11-20 | 1.6 | `task/1.6-schema-migrations` | `createMigrator()` 迁移框架（逐级升级、版本过新 / 无路径 / 步骤失败都有错误码，不修改输入）；`FILE_KINDS` 登记表和 `versions.ts`，文件 schema 和 JSON Schema 生成脚本都从这里读取（生成结果不变）；`migrate()`、`validateFile()`；`docs/adding-a-migration.md`（旧版本样例永久保留）；ROADMAP 1.6 的“v0 → v1”改为测试专用的 v1 → v2 → v3；共 545 个测试 | store、重算对版本过新文件的处理见“待整理” |
