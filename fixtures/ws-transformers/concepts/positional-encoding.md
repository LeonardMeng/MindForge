---
schema_version: 1
id: positional-encoding
name: Positional Encoding
prerequisites: [embedding]
status: active
tags: [transformer]
---

# Positional Encoding

## Description
自注意力本身不区分顺序，所以要把位置信息加进输入。原始 Transformer 用不同频率的正弦和余弦函数生成位置编码，直接加到词嵌入上。

## Learning Objectives
- 解释为什么自注意力需要位置编码。
- 写出正弦位置编码的公式。
- 比较固定的位置编码和可学习的位置嵌入。
