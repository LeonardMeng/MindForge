# @mastery/schema

Mastery OS 的文件协议：zod schema、推导出的 TypeScript 类型，以及结构化的校验错误。

纯定义：不依赖任何内部包，不做 I/O，不依赖 Node（ADR-0012）。所有包都可以依赖它，包括 `ui-*`。

## 公共类型（1.1）

| 名称 | 规则 |
|---|---|
| `SchemaVersion` | 大于等于 1 的整数 |
| `Slug` | `^[a-z0-9]+(-[a-z0-9]+)*$`，长度 1–64 |
| `GlobalConceptRef` | `<workspace-id>:<slug>`，两部分都遵守 `Slug` 规则；配套 `parseGlobalConceptRef` / `formatGlobalConceptRef` |
| `Ulid` | 26 个字符的 Crockford Base32，**只接受大写**，第一个字符 0–7 |
| `IsoDateTime` | 只有一种写法：`YYYY-MM-DDTHH:mm:ssZ`（UTC，没有毫秒和时区偏移），日期必须真实存在 |
| `DimensionScore` | `0..1` 的有限数，或 `null`（没测过） |
| `DimensionScores` | 五个维度（`DIMENSIONS`）必须全部写出，不允许其他字段 |

`Slug`、`GlobalConceptRef`、`Ulid`、`IsoDateTime` 是 branded 类型，只能通过 `parse` 得到，互相不能混用。

## 约定

- **对象一律严格校验**：出现未知字段就报错。格式演进靠 `schema_version` 和迁移（ADR-0005）。
- **结构化错误**：自定义检查都有稳定的错误码（如 `slug.invalid_format`）和参数，提示文字由消息表生成（目前只有英文）。用 `toSchemaIssues(error)` 把 zod 的错误转换成 `SchemaIssue[]`；zod 自带的错误码带 `zod.` 前缀。测试只断言错误码，不断言文字。

```ts
import { Slug, toSchemaIssues } from '@mastery/schema';

const result = Slug.safeParse('Self-Attention');
if (!result.success) {
  toSchemaIssues(result.error);
  // [{ code: 'slug.invalid_format', path: [], params: { value: 'Self-Attention' }, message: '…' }]
}
```

## 测试工具

`src/testing.ts` 提供 `slug()`、`ulid()`、`globalConceptRef()`、`isoDateTime()` 等简短的构造函数，内部仍然经过 `parse`，不合法时抛错。只给测试和 fixture 用，不从 `src/index.ts` 导出。
