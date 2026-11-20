# @mastery/store

按类型读写 Workspace 里的所有文件（ROADMAP 1.9）。依赖：`schema`、`platform`、`yaml`。所有 I/O 都通过 Platform 的 `FileSystem` 端口，不用 `node:*`。

```ts
import { createStore } from '@mastery/store';

const store = createStore(platform.fs);
const read = await store.workspace.read();
if (read?.ok) {
  const saved = await store.workspace.save(
    { ...read.value, name: 'AI Lab' },
    { base: read.snapshot },
  );
  if (!saved.ok) console.log(saved.issues); // 比如 store.modified_since_read
}
```

## 入口

| 属性 | 文件 | 能做什么 |
|---|---|---|
| `workspace` | `workspace.yaml` | `read`、`save` |
| `projects` | `projects/<slug>/project.yaml` | `list`、`read`、`save` |
| `concepts` | `concepts/<slug>.md` | `list`、`read`、`save`（值是 `{ frontmatter, body }`） |
| `criteria` | `assessments/<slug>/criteria.yaml` | `list`、`read`、`save` |
| `blindspots`、`interventions` | `<dir>/<ULID>.yaml` | `list`、`read`、`save` |
| `sessions` | `assessments/<slug>/sessions/<ULID>.json` | `list`、`read`、**只有 `append`** |
| `evidence` | `evidence/<slug>/<ULID>.json` | `list`、`read`、**只有 `append`** |
| `mastery` | `mastery/<slug>.yaml` | `list`、`read`、`write`（派生数据，直接覆盖） |
| `history` | `mastery/history/<slug>.jsonl` | `read`、`write`（派生数据，整个文件原子写出，内容没变时不写；2.5） |

Notes 不经过 store（随意编辑的 Markdown，3.x 的索引直接通过 `FileSystem` 读）。Proposal 的存放位置在 4.2 决定。

## 结果和错误

- 文件不存在时 `read` 返回 `null`。
- 解析、校验、路径不一致、写入被拒绝等问题**作为结果返回**（`{ ok: false, issues }`），方便 `mastery validate` 一次列出所有问题。每条 `StoreIssue` 带文件路径、字段路径和稳定的错误码；用 `formatStoreIssue` 生成提示。
- I/O 错误抛出 `PlatformError`。

| 错误码 | 含义 |
|---|---|
| `yaml.syntax`、`json.syntax` | 语法错误，带行号 |
| `yaml.anchor_not_allowed`、`yaml.alias_not_allowed`、`yaml.merge_key_not_allowed`、`yaml.tag_not_allowed`、`yaml.duplicate_key`、`yaml.key_not_string`、`yaml.multiple_documents`、`yaml.directive_not_allowed` | 违反“同一个值只有一种写法”（ADR-0013），一律报错 |
| `frontmatter.missing`、`frontmatter.unclosed` | Concept 文件第一行必须是 `---`，并且有结束的 `---` 行 |
| `store.path_mismatch` | 文件位置和内容里的 ID 不一致（比如 `concepts/foo.md` 的 `id` 不是 `foo`） |
| `store.already_exists` | 新建或追加的文件已经存在 |
| `store.modified_since_read` | 保存时磁盘上的文件和读取时不同 |
| `store.version_too_new` | 文件是更新版本的 Mastery OS 写的，拒绝写入 |
| `store.unexpected_file`、`store.missing_file` | 列目录时发现的不认识的文件名、缺少的文件 |
| `store.invalid_encoding` | 文件不是合法的 UTF-8 |

schema 的错误码（`field.*`、`migration.*` 等）原样转发，字段路径加上前缀（Concept 的 frontmatter 字段以 `frontmatter` 开头，history 以行号开头）。

## 读

文本 → 解析（YAML、JSON 或 frontmatter）→ schema 的 `validateFile`（先迁移，再校验）→ 检查文件位置和内容一致。

- **YAML** 用 YAML 1.2 的 core schema：不加引号的时间戳、`yes`、`no` 都是字符串。锚点、别名、合并键 `<<`、所有标签（包括 `!!str`）、重复的键、不是字符串的键、多个文档、`%YAML` / `%TAG` 指令一律报错。
- **旧版本的文件**在内存里迁移（`migratedFrom` 是原来的版本），不改写磁盘。
- **版本过新的文件**返回 `{ ok: false, readOnly: true }`，store 不会修改它。
- 成功时返回 `snapshot`：路径和内容的 SHA-256。

## 写

所有写入都是原子的（不变量 6）。

- **可修改的文件**（workspace、project、Concept、criteria、blindspot、intervention）：
  - `save(value)` 不带 `base`：创建新文件，写成规范形式；文件已存在时报 `store.already_exists`。
  - `save(value, { base })`：先确认磁盘上的内容和读取时一样（比较 SHA-256），不一样时报 `store.modified_since_read`，**不覆盖外部的修改**（比如同时在 Obsidian、VS Code 里改了这个文件）。然后只改动变化的部分：
    1. 值没有变：不写文件（`written: false`），逐字节不变。
    2. 只有标量变了、新值能写在一行：只替换这个值在源文件里的那一段，其余每个字节不变，引号风格沿用原来的。
    3. 其他情况（加减字段、列表长度变化、多行的值）：在原文档上修改后重新序列化。注释、键的顺序、引号风格保留，空白可能被规范化；新字段放在 schema 里排在它前面的字段之后。
  - 每次都把写出的文本重新解析一遍，确认表示的正是要写的值。
  - 旧版本的文件保存时写成当前版本的规范形式（注释不保留；现在还没有真正的迁移）。
  - Concept 的正文原样保留；BOM 和换行符（LF / CRLF）沿用原文件。
- **只能追加的文件**（Evidence、评测会话，不变量 2）：只有 `append`，没有修改和删除。用 Platform 的独占创建写入，ID 已存在时报 `store.already_exists`，两个进程同时写同一个 ID 时只有一个成功，不依赖写锁。
- **掌握度投影**：`write` 写成规范形式，覆盖原来的内容；内容没变时不写；原文件版本过新时报 `store.version_too_new`。
- **掌握度历史**：派生数据，由 Mastery Core 根据证据推导（2.5）。`write` 原子地写出整个文件，每行一个规范的紧凑 JSON；内容没变时不写，条目为空而文件不存在时不创建文件。已有的文件读不了时直接覆盖，有更新版本写的行时拒绝（`store.version_too_new`）。两个进程同时写同一个文件需要写锁（4.1）。

## 规范形式

新文件和派生文件总是写成同样的字节：

- YAML：键按 schema 的顺序；只含标量的列表写成 `[a, b]`；两格缩进；不折行。YAML 1.1 会误读的字符串（`"yes"`、`"2026-11-20T08:00:00Z"` 等）加引号，其他工具读出的值也一样。
- JSON：两格缩进，键按 schema 的顺序，以换行结尾。history 每行一个紧凑的 JSON。

## 测试

- `yaml.test.ts`：严格解析的每条规则；用 fast-check 做属性测试，包括规范形式读后再写逐字节不变、任意值改成任意值、只改一个标量时其他行不变。
- `store.test.ts`：每种文件读后再写逐字节不变；外部修改检测；Evidence 重复 ID、并发追加、写入中途崩溃（用 `platform-memory` 的 `crashOnNextWrite`）；版本过新和旧版本；路径不一致；列目录。
- `docs-examples.test.ts`：`docs/protocol/*.md` 里的 YAML 示例和 Concept 示例都能通过校验，同时作为上面测试的样例数据（`test-helpers.ts` 用 Vite 的 `import.meta.glob` 读取，不用 `node:*`）。

本包用到 `crypto.subtle`、`TextEncoder` 等 Web 标准的全局对象，`tsconfig.json` 的 `lib` 是 `["ES2023", "WebWorker"]`。

## 给其他包用的 YAML 工具

`yamlFile(fs, path, kind)`：任意一种登记过的文件（比如 `device.yaml`）的 `read` / `save`，和 Workspace 的文件走**同一条代码路径**（`createStore` 内部也用它）：严格解析、迁移后校验、版本过新时只读、保存时检查读取之后有没有被改过、只改动变化的部分、原子写入、不带 `base` 时独占创建。`device` 包用它读写 `device.yaml`。

`parseYaml`（严格解析）、`stringifyYaml`（规范形式）、`patchYaml`（在原文上只改动变化的部分）和 `fromRawIssue`（给解析问题加上文件路径和提示）也从本包导出。`profile-store-git` 用它们读写 Profile 的四个 YAML 文件，规则和 Workspace 的文件完全一样。
