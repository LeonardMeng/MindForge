# @mastery/cli

`mastery` 命令（ROADMAP 1.15、2.8）。依赖：`schema`、`platform`、`platform-node`、`store`、`profile`、`profile-store-git`、`device`、`core`、`core-store`、`rules-v1`；可以用 `node:*`。命令行的帮助和消息都是英文（`mastery --help`）。

| 命令 | 说明 |
|---|---|
| `mastery profile init [dir]` | 创建 Profile（默认 `~/MasteryProfile`）和这台设备的 `device.yaml`。选项：`--name`、`--language`（默认系统语言区域）、`--weekly-minutes` |
| `mastery profile show [--json]` | Profile 和每个 Workspace 在这台设备上的状态 |
| `mastery init <dir>` | 创建 Workspace，注册到 Profile，写进 `device.yaml`。选项：`--id`（默认目录名）、`--name`、`--remote` |
| `mastery validate <dir> [--json]` | 校验 Workspace 的全部文件和文件之间的引用。不需要 Profile（不变量 14） |
| `mastery evidence add [file]` | 提交一条证据，然后重算它的 Concept。`file` 是 JSON（`-` 是标准输入），只有 `id` 和 `created_at` 可以不写；不给文件时用 `--concept`、`--type`、`--recall` 等五个维度、`--confidence`、`--note`、`--session`、`--criteria-version` |
| `mastery recompute [concept] [--json]` | 重算一个 Concept，或者所有有评测标准的 Concept |
| `mastery status [concept] [--json]` | 只读投影：每个 Concept 一行；给了 Concept 时显示维度和阈值、explanation、前置依赖风险 |
| `mastery due [--within <days>] [--json]` | 需要复习的 Concept |

退出码：`0` 成功（可以有警告），`1` 发现错误、证据被拒绝（什么都没写）或命令失败，`2` 用法错误，`3` **证据已经保存**但重算失败（不要重试 `evidence add`，否则会记下重复的证据；修好问题后运行 `mastery recompute`）。

## 位置

- 设备目录：`~/.mastery`，可以用环境变量 `MASTERY_HOME` 改。
- 写进 `device.yaml` 的路径：在 home 目录里的写成 `~/…`，其他的写绝对路径。
- 还不创建 Git 仓库（Git 端口在 3.5，提交在 3.6）：命令成功后提示下一步 `cd <dir> && git init`。

## profile init

- 这台设备已经有 `device.yaml` 时拒绝。
- 目标目录里已经有 Profile、而这台设备还没有 `device.yaml` 时（`device.yaml` 丢失，或者上次在写 `device.yaml` 之前崩溃了），**直接用这个 Profile**，根据它重新生成 `device.yaml`，并列出需要在这台设备上设置的 Workspace。目录里有别的东西时拒绝。
- Profile 目录的 `.gitignore`：`.mastery/`（写锁的锁文件）和 `.mastery-tmp-*`（崩溃留下的临时文件）。设备目录的 `.gitignore` 是 `*`。
- 设备目录在某个 Git 工作区里时（比如把整个 home 目录纳入版本管理的 dotfiles 仓库）给出警告。

## profile show

`configured` 的 Workspace 按目录是否存在显示为“on this device”（`pulled`）或“missing”；另外还有 `not_configured`（这台设备还没设置）和 `unregistered_local`（Profile 里已经注销）。

## init

1. 检查全部前提：有 Profile；id 合法、没有被注册；`--remote` 合法；目标目录不存在或是空的；`device.yaml` 里没有同名的条目。
2. 写文件，只创建缺少的、从不覆盖：`concepts/`、`notes/`、`.gitignore`（`.mastery/`、`.mastery-tmp-*`）、`.gitattributes`（`mastery/*.yaml merge=mastery-recompute`，3.7 注册 driver 之前 Git 按普通文本合并）、最后写 `workspace.yaml`。
3. 注册到 Profile。
4. 写 `device.yaml` 的条目（`sync: auto`、`checkout: full`）。

**可以重跑**：上次中途崩溃时，目录里只有 `init` 自己会创建的东西，`workspace.yaml` 不存在或 id 一致；再运行一次会补上缺少的步骤，已经写好的文件不变。其他非空目录一律拒绝（以后用 `--adopt` 接管已有的目录，见 ROADMAP“待整理”）。

## validate

用 store 读取全部文件（单个文件的解析、校验、路径一致），再检查文件之间的引用：前置依赖存在、没有环（每个环报一次，从最小的 slug 开始，比如 `a → b → a`）；Project、评测标准、会话、证据、投影和历史引用的 Concept 存在；证据引用的会话存在；盲区引用的 Concept、前置 Concept 和 `merged_into` 存在；干预引用的盲区存在。wikilink 还不检查（3.x）。

## evidence、recompute、status、due（2.8）

- **Workspace**：`--workspace <dir>`；不给时从当前目录往上找第一个有 `workspace.yaml` 的目录。
- **端口**：store 上的 `createStoreRepository`、系统时钟和 `NodeIdGenerator`、只有 `rulesV1` 的规则表（`createRulesRegistry`）；事件没有监听者。测试可以在 `CliContext` 里换上假时钟和 ID 生成器。
- **evidence add**：命令行参数录入时 `evaluator` 是 `{ kind: human }`，`criteria_version` 默认是当前版本。人手动录入、没有会话的独立验证照样接受，但提示它是自己报告的、照样计入掌握度。被拒绝时打印错误码，退出码 1；保存了但重算失败时打印证据的 id，退出码 3。
- **recompute**：不给 Concept 时跳过没有评测标准的 Concept；某个失败时接着算，最后退出码 1。
- **status**：维度两位小数，`—` 表示没测过（不是 0）；到期的 `mastered` 显示 `needs_review (due)`（只在读取时推导，文件不变）。磁盘上的证据和投影的 `evidence_ids` 不一样、或者投影是别的规则版本算的时标成 `stale`。
- **due**：到期的 `mastered` 和保存的 `needs_review`（证据显示退步，排在前面）；`--within` 还列出这么多天之内到期的。
- 还没有写锁（4.1）：不要同时在两个进程里写同一个 Workspace。

## 测试

`run(argv, context)` 在同一个进程里运行命令，测试在真实磁盘的临时目录里运行（不碰真实的 home 目录）：完整流程、没有 Profile 时的提示、`device.yaml` 丢失后重建、各种状态、`init` 在每一步之后崩溃再重跑、拒绝的各种情况、`validate`（fixture、依赖环、缺少的前置依赖）、用法错误、真实文件系统上的 Profile 监听；有 `git` 时用真实的 `git add` 证明 `device.yaml`、`.mastery/` 和临时文件都不会进入提交（包括整个 home 目录是 Git 仓库的情况）。
