---
schema_version: 1
id: embedding
name: Embedding
prerequisites: [matrix-multiplication]
status: active
tags: [nlp]
---

# Embedding

## Description
把离散的 token 映射成稠密的向量。嵌入矩阵的每一行是一个 token 的向量；查表等价于用 one-hot 向量乘以嵌入矩阵。

## Learning Objectives
- 解释为什么不直接用 one-hot 向量。
- 说明嵌入查表和矩阵乘法的关系。
- 估算一个嵌入矩阵的参数量。
