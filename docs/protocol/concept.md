# concepts/&lt;slug&gt;.md

一个 Concept：YAML frontmatter 加上 Markdown 正文。用户可以编辑，agent 通过 Proposal 修改。frontmatter 的 JSON Schema：[schemas/concept-frontmatter.schema.json](schemas/concept-frontmatter.schema.json)。

## frontmatter

| 字段 | 必填 | 说明 |
|---|---|---|
| `schema_version` | 是 | `1` |
| `id` | 是 | slug，和文件名一致；一旦确定就不再改，改名只改 `name` |
| `name` | 是 | 不能为空 |
| `prerequisites` | 是 | 本 Workspace 内的前置 Concept（slug）；没有写 `[]`，不能重复 |
| `status` | 是 | `draft` / `active` / `archived`（和掌握状态是两回事） |
| `tags` | 否 | Obsidian 的标签，只接受列表 |
| `aliases` | 否 | Obsidian 的别名，只接受列表 |

为了兼容 Obsidian，**其他字段允许存在并原样保留**，`mastery validate` 会给出警告，但不报错。跨 Workspace 的前置依赖写在 Profile 的 `concept-links.yaml`，不写在这里。

## 正文

正文里约定两个英文二级标题（区分大小写），内容可以用任何语言写：

- `## Description`：这一节的文字；
- `## Learning Objectives`：顶层列表项（`-`、`*`、`+`、`1.`），每项一个学习目标。

其他章节随意。代码块（``` 和 ~~~）里的内容不算标题。缺少或重复这两节时给警告。

```markdown
---
schema_version: 1
id: self-attention
name: Self-Attention
prerequisites: [matrix-multiplication, probability]
status: active
tags: [transformer]
---

# Self-Attention

## Description
计算序列中各个 token 之间关系的机制。

## Learning Objectives
- 解释 Query、Key、Value。
- 解释注意力分数是怎么算出来的。
```

## JSON Schema 检查不了的规则

- `prerequisites` 不能包含 Concept 自己。
- `id` 和文件名一致；前置 Concept 都存在，并且没有循环依赖。由 `mastery validate` 检查。
- 正文的章节规则（上面一节）。
