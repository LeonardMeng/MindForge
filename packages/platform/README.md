# @mastery/platform

Platform 端口：所有 I/O 都通过这里的接口（ADR-0003）。实现有 `@mastery/platform-memory`（测试）、`@mastery/platform-node`（CLI）、`platform-tauri`（6.2）。

本包只包含**接口和所有实现共用的少量代码**（错误类型、路径规则），不用 `node:*`，不做 I/O。依赖：`schema`（`IsoDateTime`、`Ulid`）。

## 接口

| 接口 | 要点 |
|---|---|
| `FileSystem` | 以一个根目录为准的相对路径；`writeFile` / `writeTextFile` **原子写入**；`createFile` / `createTextFile` **原子、独占地创建**（目标已存在时报 `platform.already_exists`，并发时只有一个成功；Evidence 这类只能追加的文件用它）；`list` 只列一层、按名字排序、不返回临时文件；`stat` 对不存在的路径返回 `null`；`watch` 异步送达事件（只是提示，见下）；`cleanupTempFiles` 只删 10 分钟以前的临时文件 |
| `Clock` | `now()` 返回 `IsoDateTime`（UTC，精确到秒） |
| `IdGenerator` | `ulid()`，同一个生成器严格递增 |
| `Lock` | 有名字的互斥锁，`acquire(name, { timeoutMs })`，超时报 `platform.lock_timeout` |
| `Platform` | 以上四个端口的组合 |

文本读写用 UTF-8：BOM 原样保留，不转换换行符，保证读后再写逐字节不变。

## watch 的事件只是提示

事件可能合并、重复或丢失；覆盖写入可能报成 `created`。使用者应把 `created` 和 `modified` 同样对待，并且必须能通过重新扫描来对账（3.3 的索引更新和启动对账就是这样设计的）。

## 符号链接

- 跟随符号链接；`list` 跳过断开的链接和特殊文件（FIFO、socket、设备）；
- 解析后的真实路径在根目录外面时，所有方法都报 `platform.outside_root`，`list` 也不列出这样的链接。理由：agent 的工具通过 Platform 读文件，Workspace 里一个指向 `~/.ssh` 的链接不能让它读到根目录外面的文件；
- 资源要放在外部磁盘上，用 `device.yaml` 的 `storage.resources_dir` 配置，不用符号链接。

## 路径规则（`normalizePath`）

所有实现在使用路径之前都调用它，规则只有这一份：

- 根目录写作 `''`；只用 `/` 分隔；拒绝 `\`、绝对路径（`/x`、`C:/x`）、空段、`.` 和 `..`；
- 统一做 Unicode NFC 规范化（macOS 可能以 NFD 存储文件名），`list` 返回的名字也是 NFC；
- 拒绝 Windows 不允许的名字：保留名（`CON`、`PRN`、`AUX`、`NUL`、`COM1`–`COM9`、`LPT1`–`LPT9`，不区分大小写，带扩展名也算）、字符 `<>:"|?*`、控制字符、以点或空格结尾的名字；
- 拒绝以临时文件前缀 `.mastery-tmp-` 开头的名字。

不合法时抛出 `platform.invalid_path`，参数 `reason` 说明原因。

## 错误

所有方法出错时抛出 `PlatformError`，带稳定的错误码：`platform.not_found`、`platform.already_exists`、`platform.not_a_directory`、`platform.is_a_directory`、`platform.not_empty`、`platform.invalid_path`、`platform.invalid_encoding`、`platform.permission_denied`、`platform.outside_root`、`platform.lock_timeout`、`platform.io`。用 `isPlatformError(error, code)` 判断。测试只断言错误码。

## 契约测试（`@mastery/platform/contract`）

每个实现都调用同一套契约测试：

```ts
import { describeFileSystemContract, describeLockContract } from '@mastery/platform/contract';

describeFileSystemContract('node', () => ({ fs, leaveTempFile, symlink }), { symlinks: true });
describeLockContract('node', () => ({ first, second }));
```

这个子路径依赖 vitest（可选的 peerDependency），只在测试里使用；只用主入口的包不需要安装 vitest。符号链接的测试只在传入 `{ symlinks: true }` 且提供 `symlink` 时运行（内存实现没有符号链接）。契约测试不测大小写相关的行为（macOS 和 Windows 的文件系统默认不区分大小写）。
