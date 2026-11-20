# @mastery/core-store

Mastery Core 的 `Repository` 端口基于 store 的实现（ROADMAP 2.2）。依赖：`core`、`store`、`schema`、`platform`。CLI 和 `plugin-core`（4.2）用它把 Core 接到真实的 Workspace 上。

```ts
import { submitEvidence } from '@mastery/core';
import { createStoreRepository } from '@mastery/core-store';
import { createStore } from '@mastery/store';

const repository = createStoreRepository(createStore(platform.fs));
const result = await submitEvidence({ repository, clock, events, rules }, input);
```

## 对应关系

所有读写都经过 store，所以 store 的规则（解析、校验、迁移、路径和内容一致、原子写、Evidence 用独占创建只追加、版本过新只读）在这里同样成立。

| store 的结果 | Repository 的结果 |
|---|---|
| `read` 返回 `null` | `missing` |
| `read` 失败 | `unreadable`，`tooNew` 就是 store 的 `readOnly` |
| `evidence.list` 的问题（不认识的文件名） | `listEvidence` 的 `unreadable`，`id` 为 `null`，按文件归在一起 |
| `evidence.append` 报 `store.already_exists` | `exists`；其他问题是 `invalid` |
| `mastery.write` 报 `store.version_too_new` | `too_new`；其他问题是 `invalid` |
| `history.append` | 先校验新的一行（不合法是 `invalid`）；store 报 `store.version_too_new` 是 `too_new`，其他问题是 `unreadable` |

`listEvidence` 在列出之后被删掉的文件直接跳过（和没有列出来一样）。

## 测试

- 通过 `@mastery/core/contract` 的 Repository 契约测试（和 `@mastery/core/testing` 的内存实现是同一套）。
- 不变量 9：用 ws-transformers fixture 和真实的 store，`submitEvidence` 的每一种拒绝情况都比较提交前后全部文件的内容，必须完全相同。
