# @mastery/platform-node

Platform 端口的 Node 实现，CLI、无界面模式和 MCP 使用。和内存实现、Tauri 实现通过同一套契约测试（`@mastery/platform/contract`）。依赖：`schema`、`platform`、`ulid`；可以用 `node:*`。

```ts
import { createNodePlatform } from '@mastery/platform-node';

const platform = await createNodePlatform({ root: '/Users/me/Mastery' });
const lock = await platform.lock.acquire('write');
try {
  await platform.fs.writeTextFile('workspace.yaml', '…');
} finally {
  await lock.release();
}
```

| 导出 | 说明 |
|---|---|
| `NodeFileSystem` | `NodeFileSystem.open(root)`，`root` 必须是已存在目录的绝对路径 |
| `SystemClock` | 系统时钟，向下取整到秒 |
| `NodeIdGenerator` | `ulid` 库的单调工厂，严格递增 |
| `NodeLock` | 基于锁文件的跨进程锁 |
| `createNodePlatform` | 一次创建以上全部；锁目录默认 `<root>/.mastery/runtime/locks` |

## 文件系统

- **原子写**：同一目录里写临时文件 `.mastery-tmp-<ULID>`，fsync 后改名为目标文件，再尽量对目录 fsync（Windows 跳过）。Windows 上改名遇到短暂占用（`EPERM`、`EACCES`、`EBUSY`）时重试，最多约 1 秒。失败时删除临时文件。
- **符号链接**：跟随；断开的链接和特殊文件在 `list` 里跳过；真实路径在根目录外面时报 `platform.outside_root`。
- **文件名**：`list` 把名字转成 NFC（macOS 可能以 NFD 存储）；不是合法路径段的名字（比如别的工具创建的 `a?.md`）跳过。
- 容易因系统而异的情况先用 `stat` 检查，保证各系统报出相同的错误码。
- `watch` 用 `fs.watch(dir, { recursive: true })`。改名事件按文件现在是否存在报成 `created` 或 `removed`，事件只是提示（见 `@mastery/platform` 的说明）。

## 锁

锁文件是 `<lockDir>/<name>.lock`，内容是 JSON `{ token, pid, hostname, acquired_at }`；心跳是锁文件的修改时间。

- **获取**：独占创建（`wx`）。
- **心跳**：持有期间每 30 秒（`heartbeatIntervalMs`）更新修改时间。
- **过期**：心跳超过 2 分钟（`staleAfterMs`）没有更新，不管是不是同一台主机；或者同一台主机上持有者的进程已经不在。进程号可能被复用，所以同一台主机上也检查心跳。
- **接管是原子的**：先把过期锁文件改名成唯一的名字（只有一个进程能成功），再用 `wx` 写入新锁；改名失败的一方按“锁被别人占用”处理。如果改名拿到的已经不是判定过期的那个锁，就把它还回去。
- **留下记录**：每次清除过期锁都调用 `onStaleLock(info)`，默认发出一条 `MasteryStaleLock` 警告（`process.emitWarning`）。
- **释放**：只在令牌还是自己的时才删除锁文件，不会删掉别人接管后的锁。
- 超时报 `platform.lock_timeout`，参数里带上持有者的 `holder_pid` 和 `holder_hostname`。

## 只给测试用的钩子

- `NodeFileSystem.open(root, { hooks: { beforeRename } })`：原子写改名之前调用，抛出错误可以模拟崩溃。
- `new NodeLock(dir, { hooks: { afterStaleCheck } })`：判定过期之后、接管之前调用，用来制造两个进程同时接管的竞争。
