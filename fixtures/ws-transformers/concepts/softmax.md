---
schema_version: 1
id: softmax
name: Softmax
prerequisites: [probability]
status: active
---

# Softmax

## Description
把任意一组实数变成一个概率分布：先取指数，再除以总和。输出都是正数，加起来等于 1，原来大的数分到的概率也大。

## Learning Objectives
- 写出 softmax 的公式。
- 解释为什么计算时先减去最大值（数值稳定）。
- 说明温度如何改变输出的分布。

## 温度
softmax 之前把输入除以温度 T：T 越大，分布越平；T 越小，越接近只选最大的那个。
