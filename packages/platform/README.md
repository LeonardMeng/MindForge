# @mastery/platform

Platform 端口：所有 I/O 都通过这里的接口（ADR-0003）。实现有 `@mastery/platform-memory`（测试）、`platform-node`（1.8）、`platform-tauri`（6.2）。

本包只包含**接口和所有实现共用的少量代码**（错误类型、路径规则），不用 `node:*`，不做 I/O。依赖：`schema`（`IsoDateTime`、`Ulid`）。

## 接口

| 接口 | 要点 |
|---|---|
| `FileSystem` | 以一个根目录为准的相对路径；`writeFile` / `writeTextFile` **原子写入**；`list` 只列一层、按名字排序、不返回临时文件；`stat` 对不存在的路径返回 `null`；`watch` 异步送达事件；`cleanupTempFiles` 只删 10 分钟以前的临时文件 |
| `Clock` | `now()` 返回 `IsoDateTime`（UTC，精确到秒） |
| `IdGenerator` | `ulid()`，同一个生成器严格递增 |
| `Lock` | 有名字的互斥锁，`acquire(name, { timeoutMs })`，超时报 `platform.lock_timeout` |
| `Platform` | 以上四个端口的组合 |

文本读写用 UTF-8：BOM 原样保留，不转换换行符，保证读后再写逐字节不变。

## 路径规则（`normalizePath`）

所有实现在使用路径之前都调用它，规则只有这一份：

- 根目录写作 `''`；只用 `/` 分隔；拒绝 `\`、绝对路径（`/x`、`C:/x`）、空段、`.` 和 `..`；
- 统一做 Unicode NFC 规范化（macOS 可能以 NFD 存储文件名），`list` 返回的名字也是 NFC；
- 拒绝 Windows 不允许的名字：保留名（`CON`、`PRN`、`AUX`、`NUL`、`COM1`–`COM9`、`LPT1`–`LPT9`，不区分大小写，带扩展名也算）、字符 `<>:"|?*`、控制字符、以点或空格结尾的名字；
- 拒绝以临时文件前缀 `.mastery-tmp-` 开头的名字。

不合法时抛出 `platform.invalid_path`，参数 `reason` 说明原因。

## 错误

所有方法出错时抛出 `PlatformError`，带稳定的错误码：`platform.not_found`、`platform.already_exists`、`platform.not_a_directory`、`platform.is_a_directory`、`platform.not_empty`、`platform.invalid_path`、`platform.invalid_encoding`、`platform.permission_denied`、`platform.lock_timeout`、`platform.io`。用 `isPlatformError(error, code)` 判断。测试只断言错误码。

## 契约测试（`@mastery/platform/contract`）

每个实现都调用同一套契约测试：

```ts
import { describeFileSystemContract, describeLockContract } from '@mastery/platform/contract';

describeFileSystemContract('node', () => ({ fs, leaveTempFile }));
describeLockContract('node', () => ({ first, second }));
```

这个子路径依赖 vitest（可选的 peerDependency），只在测试里使用；只用主入口的包不需要安装 vitest。契约测试不测大小写相关的行为（macOS 和 Windows 的文件系统默认不区分大小写）。
