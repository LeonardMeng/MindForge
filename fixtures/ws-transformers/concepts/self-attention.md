---
schema_version: 1
id: self-attention
name: Self-Attention
prerequisites: [matrix-multiplication, softmax, embedding]
status: active
tags: [transformer]
aliases: [Attention]
---

# Self-Attention

## Description
计算序列中各个 token 之间关系的机制。每个 token 生成 Query、Key、Value 三个向量；用 Query 和所有 Key 的点积经过 [[softmax]] 得到权重，再对 Value 加权求和。

## Learning Objectives
- 解释 Query、Key、Value。
- 解释注意力分数是怎么算出来的。
- 解释为什么要除以 √d。
- 说明 softmax 在这里的作用。
