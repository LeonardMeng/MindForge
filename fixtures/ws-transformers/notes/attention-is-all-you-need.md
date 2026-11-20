# Attention Is All You Need 读书笔记

论文提出了完全基于注意力的 [[transformer|Transformer]]，去掉了循环和卷积。

- 核心是 [[self-attention]]：每个位置都能直接看到所有其他位置。
- [[multi-head-attention|多头注意力]] 让模型同时关注不同类型的关系。
- 没有循环结构，所以要靠 [[positional-encoding]] 提供顺序信息。

注意力权重用 softmax 计算，温度的影响见 [[softmax#温度]]。

阅读进度记在 [[2026-11]]。
