# Mastery OS

> 一个本地优先、基于文件、原生支持 Git 的个人知识掌握系统。
> **知识不等于掌握。** 读过、记过、学完一门课，都不能证明你理解了一个概念，或者会用它。

Mastery OS 帮你弄清楚自己真正掌握了什么、发现知识盲区、有针对性地学习，并长期验证掌握程度。所有学习数据都是普通文件（Markdown / YAML / JSON），用 Git 管理历史和同步，不需要账号，也不需要联网。

> **给 AI 编码助手（Claude Code 等）：** 开始任何工作前，先读完本文件和 [`ROADMAP.md`](./ROADMAP.md)。
> 一次会话只做 ROADMAP 里的**一个任务编号**。第 9 节的“不变量”和第 6 节的“依赖规则”不可违反；如果任务和它们冲突，停下来问人。

---

## 1. 产品原则

| 原则 | 含义 | 在代码里怎么体现 |
|---|---|---|
| 本地优先 | 核心功能离线可用 | 核心包不依赖网络；云服务都是可选的适配器 |
| 基于文件 | 用户数据是可读、可迁移的文件 | 文件系统是唯一的权威数据源；SQLite 只是可重建的索引 |
| 原生 Git | 历史、分支、diff、同步都用 Git | 按领域事务提交；掌握度投影有专用 merge driver |
| 用户拥有数据 | 不打开应用也能读懂自己的数据 | 格式都有 JSON Schema 和文档；兼容 Obsidian 的 wikilink |
| 以证据定掌握 | 掌握度必须由评测证据推导 | Agent 不能直接写掌握度；只有 Mastery Core 能算 |
| 一切皆插件 | Agent、工具、模型、规则都能插拔 | 基于 Cordis 的插件系统；Core 是“纯内核 + 插件外壳” |

## 2. 核心概念

| 概念 | 说明 |
|---|---|
| **Workspace** | 一个长期的知识领域，比如 AI、数学、物理。一个 Workspace 对应一个 Git 仓库 |
| **Project** | Workspace 里的一个具体学习或研究目标 |
| **Concept** | 知识的基本单位。它不只是一篇笔记，而是带学习目标、前置依赖和评测标准的结构化定义 |
| **Criteria** | 某个 Concept 的评测标准，带版本号 |
| **Evidence** | 一次掌握程度的证明记录。只能追加，并记录评测时用的 criteria 版本 |
| **Mastery** | 系统根据证据和版本化的规则，算出的当前掌握度（投影） |
| **Blindspot** | 怀疑或已确认的知识缺口、误解或薄弱点 |
| **Intervention** | 针对某个缺口设计的学习活动 |
| **Note** | 用户的自由笔记（Markdown），通过 `[[wikilink]]` 关联到 Concept |
| **Profile** | **必需的**用户级数据：学习者画像、已注册的 Workspace、跨 Workspace 的概念链接。当前用 Git 仓库实现，将来可以换成云服务 |
| **Device** | 某一台设备的本地配置：Workspace 在这台机器上的路径、同步策略等。不提交、不同步 |

### 掌握度的评估维度

`recall`（记忆）· `understanding`（理解）· `reasoning`（推理）· `application`（应用）· `transfer`（迁移）

每个维度单独评估。**没测过记为 `null`，不是 0**：“没考过”和“考得差”必须能区分开。

### 掌握状态

```text
not_assessed ─► diagnosed ─► learning ─► provisional_mastery ─► mastered
                                 ▲                                  │
                                 └────────── needs_review ◄─────────┘
```

状态迁移的条件写在版本化的规则文件里（`packages/rules-v1`），不写死在代码里。

## 3. 智能角色

| 角色 | 作用域 | 职责 | 写权限 |
|---|---|---|---|
| **Supervisor** | 用户级（跨所有 Workspace） | 全局学习者模型、请求路由、跨学科前置依赖风险、全局复习排程 | 只通过 `ProfileStore` 写 Profile |
| **SuperAgent** | Workspace 级（类似单科老师） | 规划学习，调度下属 agent，组织“诊断 → 干预 → 验证”闭环 | 提交 Proposal |
| Teacher Agent | Workspace | 讲解，设计练习和 Intervention | 提交 Proposal |
| Assessment Agent | Workspace | 根据 criteria 出题 | 提交 Proposal |
| Evaluator Agent | Workspace | 评分，输出五个维度的结构化结果 | 提交 Evidence |
| Research Agent | Workspace | 从本地或已配置的远程来源查找资料 | 提交 Proposal |
| Planning Agent | Workspace | 安排学习目标和时间表 | 提交 Proposal |

**所有 agent 都只产出结果和 Proposal（变更提案），不直接写文件。** 只有 Knowledge 服务（背后是 Mastery Core）能校验并落盘。

## 4. 架构

```text
┌──────────────── React + TypeScript UI（五个平台共用）──────────────────┐
│  Workspace / Concept 编辑 / 掌握度面板 / 评测 / 审批队列 / Agent 查看器 │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ 类型化的 RPC + 事件流（postMessage）
┌───────────────────────────────▼────────────────────────────────────────┐
│  Runtime（运行在 Web Worker 里；CLI / 无界面模式运行在 Node 上）        │
│                                                                        │
│  Cordis Root Context ─ 用户级                                          │
│   ├─ supervisor · profile · llm(providers…) · platform                 │
│   └─ Workspace Fork × N                                                │
│        ├─ superagent · agents 注册表 · tools · skills                  │
│        ├─ knowledge（plugin-core：Mastery Core 的插件外壳，受保护）      │
│        └─ store · index · git                                          │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ 纯 TS 端口（不依赖 Cordis，不依赖 node:*）
┌───────────────────────────────▼────────────────────────────────────────┐
│  Mastery Core：校验 · 证据 · 规则计算 · 状态机 · 投影 · 复习调度        │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ Platform 端口
┌───────────────────────────────▼────────────────────────────────────────┐
│  Platform 实现                                                         │
│   · platform-memory（测试用）  · platform-node（CLI）                   │
│   · platform-tauri（Rust 插件：文件 / gitoxide / rusqlite+FTS5 / watcher）│
└────────────────────────────────────────────────────────────────────────┘
        文件系统（权威） · Git（历史/同步） · SQLite（可重建索引）
```

### 写入路径

```text
Agent ─► Proposal ─► knowledge 服务 ─► Mastery Core（schema 校验 → 引用校验
      → criteria 版本校验 → 规则计算）─► store 原子写 ─► index 增量更新
      ─► 领域事件（evidence/submitted、mastery/changed…）─► git 事务提交
```

需要人工确认的 Proposal（修改 Concept 定义、合并 Blindspot 等）进入 UI 的审批队列。

### 插件模型（Cordis）

| 类型 | 说明 | 例子 |
|---|---|---|
| Service | 基础能力，实现可替换 | `llm`、`store`、`index`、`git`、`platform` |
| Agent | 注册到 `agents` 服务；声明 capabilities；输入 Task，输出 Result + Proposal | `agent-teacher` |
| Tool | 具体操作，由 agent 调用 | `tool-pdf`、`tool-python-sandbox` |
| Skill | 可复用的提示词 / 工作流（Markdown + YAML），不是代码 | `skills/socratic-explain.md` |
| Rules | 版本化的掌握度计算规则，注册到 `rules` 服务 | `rules-v1` |

`knowledge` 服务是**受保护的**：只能由官方的 `plugin-core` 提供，第三方插件只能使用它，不能替换它。

每个 Workspace 在 `workspace.yaml` 里声明自己装哪些插件：

```yaml
plugins:
  agent-teacher:   { style: socratic }
  agent-evaluator: { model: cloud:anthropic }
  ~agent-research: {}        # ~ 前缀表示禁用
```

## 5. 仓库结构

```text
mastery-os/
├── README.md                 ← 本文件：架构、规则、协议（相对稳定）
├── ROADMAP.md                ← 任务清单和当前进度（经常更新）
├── CLAUDE.md                 ← AI 助手的简短入口，指向上面两个文件
├── docs/
│   ├── adr/                  架构决策记录（ADR-0001-*.md）
│   └── protocol/             文件协议规范（从 schema 包自动生成 + 人工说明）
├── fixtures/
│   └── ws-transformers/      示例 Workspace，所有测试共用
├── packages/
│   ├── schema/               zod schema、JSON Schema 导出、schema_version、迁移
│   ├── platform/             Platform 端口接口（只有类型）
│   ├── platform-memory/      内存实现，测试用
│   ├── platform-node/        Node 实现，CLI 用
│   ├── platform-tauri/       Tauri 实现的 TS 侧封装（Rust 部分在 apps/desktop/src-tauri）
│   ├── store/                Markdown/YAML/JSON 读写、frontmatter、原子写、锁
│   ├── core/                 Mastery Core（纯领域逻辑）
│   ├── rules-v1/             掌握度规则 v1
│   ├── index/                SQLite 索引、FTS、wikilink、重建
│   ├── git/                  事务提交、同步、merge driver
│   ├── runtime/              Cordis 宿主、Workspace fork、Loader
│   ├── plugin-core/          把 core 包装成 knowledge 服务
│   ├── llm/                  llm 服务和 provider 接口
│   ├── providers/            ollama/ · openai/ · anthropic/ · mock/
│   ├── agents/               assessor/ · evaluator/ · teacher/ · research/ · planner/
│   ├── superagent/
│   ├── supervisor/
│   ├── profile/              ProfileStore 接口和 Profile 领域逻辑
│   ├── profile-store-git/    ProfileStore 的 Git 实现（将来再加 profile-store-cloud/）
│   ├── device/               device.yaml 读写、设备 ID、钥匙串访问
│   ├── tools/                pdf/ · python-sandbox/ · web-search/
│   ├── rpc/                  UI ↔ Runtime 的类型化 RPC 协议
│   ├── cli/                  `mastery` 命令
│   ├── mcp/                  可选：MCP 服务端点
│   └── ui-*/                 UI 按功能拆包：ui-kit/ ui-editor/ ui-mastery/ ui-graph/ …
└── apps/
    └── desktop/              Tauri 2 应用（src-tauri/ 里是 Rust 插件）
```

**每个包控制在 5,000 行以内。** 超过就拆包。这样 AI 助手一次会话能装下一个包的完整上下文。

## 6. 依赖规则（由 dependency-cruiser 在 CI 中强制检查）

```text
schema        ← 不依赖任何内部包
platform      ← 只依赖 schema（只有类型）
store         ← schema, platform
core          ← schema, platform（只用端口类型）
rules-v1      ← schema, core（只用规则接口）
index, git    ← schema, platform, store
profile       ← schema（只定义 ProfileStore 接口和 Profile 领域逻辑）
profile-store-git ← profile, schema, platform, store, git
device        ← schema, platform（读写 device.yaml，访问系统钥匙串）
plugin-core   ← core, store, index, git, runtime 类型, cordis      ← Core 和 Cordis 唯一的交汇点
runtime       ← cordis, schema, platform
agents/*      ← cordis, llm 类型, plugin-core 暴露的 knowledge 接口类型
ui-*          ← schema, rpc, ui-kit（永远不 import runtime、core、platform）
```

**所有包都可以依赖 `schema`**，包括 `ui-*`（6.6 的编辑器要在保存前直接调用 schema 的校验函数）。上图中其他包的依赖列表里没有逐一写出 schema。

没有出现在上图里的包，暂时只受下面“硬性禁止”的约束；新建包时要按第 12 节第 10 条补上它的依赖列表。

硬性禁止：

1. `schema`、`core`、`rules-v1`、`store`、`index`、`git` **不能 import `cordis`**。
2. 除了 `platform-node`、`cli`、`mcp` 以外，所有包**不能 import `node:*`**，也不能用 Node 专有的全局对象。所有 I/O 都通过 Platform 端口。
3. `agents/*`、`superagent`、`supervisor` **不能 import `store`、`git`、`index`**。数据只能通过 `knowledge` 服务读取，写入只能通过提交 Proposal。
4. `ui-*` 不能 import `runtime` 或 `core`，只能通过 `rpc` 通信。
5. **只有 `platform-tauri` 和 `apps/desktop` 能 import `@tauri-apps/*`**。其他包（特别是 `ui-*`）都不能直接调用 Tauri，这样 UI 将来不用改代码就能跑在 Web 版里。
6. **`schema` 的运行时代码只能依赖 `zod`**（ADR-0013）。新增任何外部依赖都必须先写 ADR；测试文件不受这条限制。

## 7. 数据协议

### Workspace 目录

```text
MyWorkspace/
├── .git/
├── .gitignore               # 忽略 .mastery/
├── .gitattributes           # mastery/*.yaml merge=mastery-recompute
├── workspace.yaml
├── projects/<slug>/project.yaml
├── concepts/<slug>.md
├── notes/**/*.md            # 自由笔记，系统只读和索引
├── assessments/<concept-slug>/
│   ├── criteria.yaml
│   └── sessions/<ULID>.json
├── evidence/<concept-slug>/<ULID>.json
├── mastery/<concept-slug>.yaml          # 派生的投影，提交到 Git 方便阅读
├── mastery/history/<concept-slug>.jsonl # 只追加的历史
├── blindspots/<ULID>.yaml
├── interventions/<ULID>.yaml
├── resources/               # 原始文件；大文件可以用 Git LFS
└── .mastery/                # 不提交：index.db、cache/、runtime/（agent 运行日志）
```

### 文件格式

| 数据 | 格式 | 是否可编辑 |
|---|---|---|
| Concept | Markdown + YAML frontmatter | 用户可以编辑；外部修改会被重新校验 |
| Workspace / Project / Criteria | YAML | 用户可以编辑 |
| 评测会话 / Evidence | JSON | **只能追加**，不能修改 |
| 掌握度投影 | YAML | **派生数据**，手工修改会被重算覆盖 |
| Note | Markdown | 用户随意编辑 |
| 索引 / 缓存 | SQLite + 本地文件 | 随时可以删除，可以重建 |

### ID 和版本

- **Concept ID**：Workspace 内部用 `slug`（`self-attention`），全局引用写成 `<workspace-id>:<slug>`（`ai:self-attention`）。frontmatter 里的 `id` 一旦确定就不再改；改名只改 `name`。
- **Evidence、Session、Blindspot、Intervention 的 ID**：使用 ULID。多台设备同时生成也不会冲突，而且按时间有序。
- **每个结构化文件都有 `schema_version`**（整数）。读取旧版本文件时用迁移函数在内存中升级；只有用户明确执行 `mastery migrate` 时才改写磁盘上的文件。
- **每条 Evidence 都记录 `criteria_version`**。每个掌握度投影都记录 `rules_version`。

### Concept 示例

```markdown
---
schema_version: 1
id: self-attention
name: Self-Attention
prerequisites: [matrix-multiplication, probability]
status: active
---

# Self-Attention

## Description
计算序列中各个 token 之间关系的机制。

## Learning Objectives
- 解释 Query、Key、Value。
- 解释注意力分数是怎么算出来的。
- 解释 softmax 的作用。
```

### Evidence 示例

```json
{
  "schema_version": 1,
  "id": "01JD3K8Q8Z6V7X2N4M5P9R0T1W",
  "concept_id": "self-attention",
  "session_id": "01JD3K7A2B3C4D5E6F7G8H9J0K",
  "assessment_type": "independent_verification",
  "criteria_version": 1,
  "dimensions": {
    "recall": 0.9, "understanding": 0.85, "reasoning": 0.8,
    "application": 0.7, "transfer": null
  },
  "confidence": 0.88,
  "evaluator": { "kind": "agent", "id": "agent-evaluator", "model": "ollama:qwen3-14b" },
  "note": null,
  "created_at": "2026-11-19T10:00:00Z"
}
```

### Profile（必需，跟着用户走）

**每个用户必须有且只有一个 Profile。** 应用启动时先加载 Profile，再打开 Workspace；没有 Profile 时，首次启动向导会先创建一个。`mastery init` 创建 Workspace 时，会自动把它注册到当前 Profile。

Profile 通过 `ProfileStore` 端口访问，**上层代码（Supervisor、runtime、UI）不知道 Profile 存在哪里**：

| 实现 | 状态 | 说明 |
|---|---|---|
| `profile-store-git` | 现在 | Profile 是一个本地 Git 仓库，可以推送到用户自选的远程 |
| `profile-store-cloud` | 将来 | 云服务。**必须在本地保留完整副本**，离线时照常读写，联网后再同步（本地优先原则不变） |

无论哪种实现，Profile 的数据模型都相同，都由 `schema` 包定义，并带 `schema_version`。从 Git 迁移到云服务（或反过来）就是一次导出和导入，不改变数据格式。

Git 实现的目录结构：

```text
MasteryProfile/
├── profile.yaml          id、显示名称、学习偏好、目标、每周时间预算
├── workspaces.yaml       已注册的 Workspace：id、名称、远程地址（不写本地路径）
├── concept-links.yaml    跨 Workspace 的关系，例如 ai:self-attention requires math:matrix-multiplication
├── learner-model/        Supervisor 维护的画像：学习风格、常见错误模式（敏感数据，默认私有）
├── skills/               全局 skill，所有 Workspace 都能用
└── defaults.yaml         插件和模型的默认配置，Workspace 可以覆盖（不含密钥）
```

```yaml
# workspaces.yaml（提交，跨设备共享）
schema_version: 1
workspaces:
  - id: ai
    name: AI
    remote: git@github.com:me/mastery-ai.git
  - id: math
    name: 数学
    remote: git@gitea.local:me/mastery-math.git
```

### Device（每台设备一份，不同步）

`~/.mastery/device.yaml` 记录**只属于这台设备**的配置。它不进 Profile，不提交，不同步，因为每台设备的路径、存储空间和网络条件都不一样。

```yaml
# ~/.mastery/device.yaml
schema_version: 1
device:
  id: 01JD4A0Y3S8M2K7Q5N1V6B9C0D       # ULID，首次启动时生成，之后不变
  name: 工作笔记本                       # 显示用，可修改
  platform: macos                        # macos | windows | linux | ios | android

profile:
  store: git                             # git | cloud（将来）
  path: ~/MasteryProfile                 # store 为 git 时使用
  # endpoint: https://…                  # store 为 cloud 时使用
  # cache_path: ~/.mastery/profile-cache # cloud 的本地完整副本

workspaces:
  ai:
    path: ~/Mastery/ai
    sync: auto                           # auto | manual | on-demand
  math:
    path: ~/Mastery/math
    sync: on-demand                      # 没有 clone 到本机；用到时再拉取
    checkout: text-only                  # full | text-only（部分克隆，资源文件按需下载）

sync:
  on_metered_network: false              # 计费网络下是否同步
  interval_minutes: 15

storage:
  resources_dir: ~/Mastery/_resources    # 外部资源文件的本地存放位置
  max_cache_mb: 2048

models:
  local_runtime: ollama                  # 这台设备上可用的本地模型运行时
  local_endpoint: http://127.0.0.1:11434
```

规则：

- **密钥不写在 `device.yaml` 里。** API key、Git 凭据、云服务 token 都放在系统钥匙串（Keychain、Windows Credential Manager、Secret Service、Android Keystore），`device.yaml` 最多只记录钥匙串里条目的名称。
- `workspaces.yaml` 里注册了、但 `device.yaml` 里没有的 Workspace，表示“这台设备还没拉取”，UI 里显示为可下载。
- `device.yaml` 里有、但 Profile 里已经注销的 Workspace，启动时提示用户：保留本地副本，还是删除。
- `device.yaml` 损坏或丢失时，可以根据 Profile 重新生成（路径需要用户重新确认），不会丢失学习数据。

### 全局索引

全局索引（`~/.mastery/global.db`）根据 Profile 里注册的 Workspace，扫描它们的 `mastery/*.yaml` 生成，可以随时删除和重建。

### 启动顺序

```text
读取 device.yaml（不存在 → 首次启动向导，生成 device id）
  → 通过 ProfileStore 加载 Profile（不存在 → 创建或从远程拉取）
  → 对照 workspaces.yaml 和 device.yaml，确定本机可用的 Workspace
  → 打开或重建全局索引
  → 启动 Root Context（Supervisor 等）
  → 用户打开 Workspace → 创建 Workspace fork
```

## 8. Git 约定

- **按领域事务提交**，不要每改一句话就提交一次。事务包括：创建或实质修改 Concept、完成一次评测会话、记录证据、完成一次干预、更新掌握度投影。
- commit message 格式：`mastery: <动作> <对象>`，附带结构化 trailer：
  ```text
  mastery: complete assessment self-attention

  Mastery-Session: 01JD3K7A2B3C4D5E6F7G8H9J0K
  Mastery-Concepts: self-attention
  ```
- `.gitattributes` 里的 `mastery/*.yaml merge=mastery-recompute`：发生合并冲突时，不做文本合并，而是根据合并后的全部证据重新计算投影。
- 不提交 `.mastery/`、临时文件和 agent 运行时状态。

## 9. 不变量（每一条都必须有测试）

1. **删除 `.mastery/` 不丢数据**：执行 `mastery reindex` 后，所有查询结果和删除前一致。
2. **Evidence 只追加**：任何代码路径都不能修改或删除已有的 Evidence 文件。
3. **掌握度是确定的**：同一组证据加同一版本的规则，算出的投影逐字节相同（不依赖文件读取顺序和当前时间，时间只通过 Clock 端口传入）。
4. **Agent 不能直接写掌握度**：投影只能由 Mastery Core 写出。
5. **未测试不等于 0**：维度值为 `null` 的情况，在计算、存储、展示时都和 0 区分开。
6. **原子写**：写入中途崩溃，不会留下半截文件（先写临时文件，再 rename）。
7. **离线可用**：在没有网络、没有配置任何云 provider 的情况下，所有核心功能的测试都能通过。
8. **Core 不依赖运行时**：`core` 的测试不启动 Cordis，不调用 LLM。
9. **校验失败不改文件**：Proposal 校验不通过时，磁盘上的文件保持不变。
10. **未经同意不发数据**：没有配置并获得用户同意时，任何用户数据都不会发送给云端 provider。
11. **Profile 必需，但离线可用**：运行时必须有 Profile 才能启动；任何 `ProfileStore` 实现（包括将来的云服务）都必须在本地保留完整副本，断网时可以正常读写。
12. **上层不知道 Profile 存在哪里**：除了 `profile-store-*` 实现包，没有任何代码直接读写 Profile 的文件或调用云服务接口。
13. **设备配置不外泄**：`device.yaml` 不被提交、不被同步，里面也不出现任何密钥。
14. **Workspace 的文件仍然自描述**：脱离 Profile，单看一个 Workspace 目录，里面的文件依然可读、可通过 `mastery validate` 校验。Profile 是运行时必需的，但不是读懂数据的前提。

## 10. 技术栈

| 领域 | 选型 |
|---|---|
| 语言 | TypeScript（strict）、Rust（只用于 Tauri 插件） |
| 包管理 | pnpm workspace |
| 构建 | tsup（库）、Vite（UI） |
| 测试 | Vitest；属性测试用 fast-check；Rust 用 cargo test |
| Schema | zod，并导出 JSON Schema |
| 插件 | Cordis |
| 桌面 / 移动 | Tauri 2（macOS、Windows、Linux、iOS、Android） |
| UI | React、TanStack Router / Query、shadcn/ui、Tailwind |
| 编辑器 | CodeMirror 6 |
| 概念图 | React Flow |
| 索引 | SQLite + FTS5（Node 用 better-sqlite3，Tauri 用 rusqlite） |
| Git | Node 端调用系统 git；Tauri 端用 gitoxide 或 libgit2 |
| ID | ULID |
| 本地模型 | Ollama（第一个 provider） |
| 依赖边界 | dependency-cruiser |

## 11. 开发

```bash
pnpm install
pnpm build            # 构建所有包
pnpm test             # 所有测试
pnpm lint             # eslint + prettier --check + dependency-cruiser
pnpm typecheck        # 类型检查（tsc）
pnpm check            # = lint + typecheck + test，每个任务结束前必须通过

pnpm --filter @mastery/core test        # 只测一个包
pnpm mastery -- validate fixtures/ws-transformers
```

## 12. AI 助手工作约定

1. **开始前**：读 `README.md`、`ROADMAP.md` 和要改的包的 `src/index.ts`。确认任务的依赖任务已经完成。
2. **一次只做一个任务编号**，在单独的分支上做：`task/<编号>-<简短描述>`，例如 `task/2.4-state-machine`。
3. **先计划后动手**：先给出方案（要改哪些文件、新增哪些测试），等人确认后再写代码。
4. **先写测试**：Core、规则、schema、store 这些包，先写测试，再写实现。
5. **不做任务范围外的事**：发现需要做的其他事，加到 ROADMAP 的“待整理”一节，不要顺手做掉。
6. **不能为了让测试通过而修改不变量、依赖规则或已有测试的预期**。如果确实需要改，停下来说明理由，等人决定，并写一份 ADR（模板见 `docs/adr/TEMPLATE.md`）。
7. **结束前**：`pnpm check` 通过；在 ROADMAP 里勾选任务并填写“完成记录”；更新相关包的 README（如果有公共 API 变化）。
8. **新增依赖要说明理由**。优先使用已经在技术栈里的库。
9. **公共 API 都要有 TSDoc 注释**；导出类型集中在每个包的 `src/index.ts`。
10. **新建包时，在同一个任务里把它的依赖白名单补进第 6 节**，并同步更新 `.dependency-cruiser.js`。

## 13. 术语对照

| 中文 | 代码中的名称 |
|---|---|
| 工作区 | `Workspace` |
| 概念 | `Concept` |
| 评测标准 | `Criteria` |
| 评测会话 | `AssessmentSession` |
| 证据 | `Evidence` |
| 掌握度投影 | `MasteryProjection` |
| 盲区 | `Blindspot` |
| 干预 | `Intervention` |
| 变更提案 | `Proposal` |
| 领域事件 | `DomainEvent` |

## License

待定。
