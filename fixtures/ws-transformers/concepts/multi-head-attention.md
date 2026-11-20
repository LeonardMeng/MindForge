---
schema_version: 1
id: multi-head-attention
name: Multi-Head Attention
prerequisites: [self-attention]
status: active
tags: [transformer]
---

# Multi-Head Attention

## Description
把 Query、Key、Value 投影到多个低维子空间，在每个子空间里分别做 [[self-attention|自注意力]]，再把结果拼接起来做一次线性变换。不同的头可以关注不同类型的关系。

## Learning Objectives
- 解释为什么要用多个头。
- 计算多头注意力的参数量。
- 说明头数和每个头的维度之间的关系。
