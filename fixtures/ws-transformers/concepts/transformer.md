---
schema_version: 1
id: transformer
name: Transformer
prerequisites: [multi-head-attention, positional-encoding, layer-normalization, residual-connection]
status: draft
tags: [transformer]
---

# Transformer

## Description
完全基于注意力的序列模型。编码器和解码器都由多层堆叠而成，每层包含多头注意力和前馈网络，每个子层外面都有残差连接和层归一化。

## Learning Objectives
- 画出一个编码器层的结构。
- 说明解码器的掩码自注意力和编码器的自注意力有什么不同。
- 解释 Transformer 为什么比 RNN 更容易并行。
