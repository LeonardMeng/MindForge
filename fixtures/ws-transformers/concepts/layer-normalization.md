---
schema_version: 1
id: layer-normalization
name: Layer Normalization
prerequisites: [probability]
status: active
aliases: [LayerNorm]
---

# Layer Normalization

## Description
对一个样本的所有特征求均值和方差，归一化到均值 0、方差 1，再乘以可学习的缩放、加上可学习的偏移。和批归一化不同，它不依赖批大小。

## Learning Objectives
- 写出层归一化的计算步骤。
- 比较层归一化和批归一化。
- 解释可学习参数 γ 和 β 的作用。
