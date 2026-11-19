# 给文件格式加一次迁移

文件格式变了（比如 Evidence 加了一个必填字段），就把这种文件的版本从 N 升到 N+1，并写一步迁移 N → N+1。读到旧版本的文件时，`migrate()` 会在内存里逐级升级到当前版本；只有用户执行 `mastery migrate` 时才改写磁盘（ADR-0005）。

## 什么时候需要

- 文件的格式变了，旧文件按新 schema 会校验不过：需要。
- 只是放宽规则，旧文件仍然有效：不需要升版本。
- 掌握度投影是派生数据，可以由证据重算。改它的格式时可以考虑直接重算，而不是写迁移，但版本号仍然要升。

## 步骤

以 `evidence` 从 v1 升到 v2 为例。

1. **升版本号**：把 `packages/schema/src/versions.ts` 里的 `evidence: 1` 改成 `2`。版本号只在这里写一次，schema 的 `schema_version` 和登记表都引用它。
2. **改 schema**：在 `evidence.ts` 里改成新格式。不保留旧版本的 schema。
3. **写迁移步骤**：在 `src/migrations/evidence.ts` 里写 `1: (data) => ({ ...data, 新字段: 默认值 })`，并在 `src/file-kinds.ts` 里 `evidence` 那一项的 `migrations` 里登记它。`schema_version` 由框架设置，步骤里不用写。
4. **加样例测试（必须）**：见下一节。
5. **重新生成协议文档**：`pnpm --filter @mastery/schema gen`，更新 `docs/protocol/` 的说明页和示例。
6. 如果格式变化改变了某个决策（ADR-0013 等），按 README 第 12 节写 ADR。

## 迁移步骤的规则

- 纯函数：返回**新对象**，不能修改输入（输入是冻结的，修改会报 `migration.step_failed`），没有 I/O，结果是确定的。
- 输入是普通对象，没有旧 schema 帮你校验，所以要对缺字段、类型不对的情况有防御。
- 保留不认识的字段（特别是 Concept 的 frontmatter，要兼容 Obsidian）。
- 一步只升一个版本。不支持降级。

## 旧版本样例：永久保留，不删除

因为不保留旧 schema，旧格式只能靠样例来记住。**每加一步真实的迁移，必须同时加上“旧版本样例 → 期望的新版本结果”的测试**：

```text
packages/schema/fixtures/migrations/evidence/
├── v1-from-session.json              旧版本样例：永久保留，不删除、不修改
└── v1-from-session.expected-v2.json  期望的升级结果
```

- 样例是**解析后的数据**，统一存成 JSON（YAML 文件的样例也存解析后的 JSON），测试用 `import … with { type: 'json' }` 读取。
- 测试断言 `migrate(kind, 旧样例)` 的结果等于期望文件，并且 `validateFile(kind, 旧样例)` 通过当前 schema 的校验。
- 之后每次再升版本，这些旧样例都要能一路升级到最新版本：在测试里加上“从 v1 样例升到最新版本”的断言，期望文件按需更新。
- 样例要覆盖各种形态：可选字段写了和没写、`null` 和非 `null`、Concept frontmatter 带未知字段。

## 版本过新的文件

读到比当前版本还新的文件（`migration.version_too_new`），说明它是新版本的 Mastery OS 写的。这样的文件**只能读，不能修改或覆盖**，提示用户升级 Mastery OS。
