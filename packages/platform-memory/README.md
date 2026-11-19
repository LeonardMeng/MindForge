# @mastery/platform-memory

Platform 端口的内存实现，**测试用**。和 Node、Tauri 实现通过同一套契约测试（`@mastery/platform/contract`）。依赖：`schema`、`platform`。

```ts
import { createMemoryPlatform } from '@mastery/platform-memory';

const platform = createMemoryPlatform({ now: '2026-11-20T08:00:00Z' });
await platform.fs.writeTextFile('workspace.yaml', '…');
platform.clock.advance(60_000);
```

| 导出 | 说明 |
|---|---|
| `MemoryFileSystem` | 内存文件系统。写入和真实实现一样“先写临时文件，再改名” |
| `FakeClock` | 假时钟：`set(time)`、`advance(ms)`；`now()` 精确到秒 |
| `MemoryIdGenerator` | 确定性的 ULID：时间部分来自时钟，随机部分换成计数器；严格递增 |
| `MemoryLockSpace` | 锁空间：`lock()` 每调用一次得到一个入口，模拟多个进程 |
| `createMemoryPlatform` | 一次创建以上全部，共用同一个假时钟 |

## 只有内存实现才有的能力

- `fs.crashOnNextWrite()`：让下一次写入“写到一半崩溃”。目标文件保持不变，只留下写了一半的临时文件，并抛出 `SimulatedCrashError`。用来验证不变量 6（原子写）。
- `fs.leaveTempFile(dir, ageMs)`：留下一个指定“年龄”的临时文件，契约测试用来测试 `cleanupTempFiles`。

本包用到 `TextEncoder` 等 Web 标准的全局对象，`tsconfig.json` 的 `lib` 是 `["ES2023", "WebWorker"]`。
