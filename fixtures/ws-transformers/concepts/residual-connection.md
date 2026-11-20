---
schema_version: 1
id: residual-connection
name: Residual Connection
prerequisites: []
status: active
aliases: [Skip Connection]
---

# Residual Connection

## Description
把一层的输入直接加到它的输出上：y = x + F(x)。梯度可以沿着这条捷径直接传回前面的层，深层网络因此更容易训练。

## Learning Objectives
- 写出残差连接的公式。
- 解释残差连接为什么能缓解梯度消失。
- 说明为什么输入和输出的形状必须一致。
