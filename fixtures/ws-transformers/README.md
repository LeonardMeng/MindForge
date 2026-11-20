# ws-transformers

示例 Workspace（ROADMAP 1.10），所有测试共用。测试里通过 `@mastery/testkit` 使用：

```ts
const fs = await loadFixture('ws-transformers'); // 每次调用都是一份新的、独立的 MemoryFileSystem
```

## 内容

- 10 个 Concept，从 matrix-multiplication、probability 到 transformer，带前置依赖（没有环）。`transformer` 是 `draft`，其余是 `active`；没有任何 Concept 依赖 `transformer`。
- 3 份评测标准：softmax、self-attention、multi-head-attention。
- 1 个 Project：read-attention-paper。
- 3 篇笔记（其中一篇在子目录里），用 `[[slug]]`、`[[slug|别名]]`、`[[slug#标题]]` 链接 Concept 和其他笔记。
- 没有 Evidence、评测会话、掌握度投影和历史（M2 再加），也没有盲区和干预。

**零警告基线**：用 store 读取所有文件没有错误，也没有警告；所有前置依赖、Project 里的 Concept 和 wikilink 都能找到。`packages/store/src/fixture-ws-transformers.test.ts` 检查这些。需要有问题的文件时，在测试里另外构造，不要改这里。

这里的文件逐字节有意义（store 的“读后再写逐字节不变”），所以不经过 Prettier（`.prettierignore`）。

## 为什么没有 `.gitattributes`

真正的 Workspace 有 `.gitattributes`（`mastery/*.yaml merge=mastery-recompute`，见 README 第 7 节）。但这个目录在 mastery-os 仓库里面，放在这里的 `.gitattributes` 会对 mastery-os 仓库本身生效，让 Git 对这些路径使用一个不存在的 merge driver。所以**故意不放**，不要补上。需要测试 merge driver 时（3.7），在测试里生成。

`.gitignore` 可以放：它只忽略这个目录下的 `.mastery/` 和崩溃留下的临时文件 `.mastery-tmp-*`。
