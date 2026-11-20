# @mastery/testkit

测试工具，**只给测试用**：把 `fixtures/` 下的示例 Workspace 加载进 `MemoryFileSystem`。依赖：`platform`、`platform-memory`。

```ts
import { fixtureFiles, loadFixture } from '@mastery/testkit';

const fs = await loadFixture('ws-transformers'); // 每次调用都是新的、独立的文件系统
const files = fixtureFiles('ws-transformers'); // 路径 → 原始文本，每次返回新的 Map
```

| 导出 | 说明 |
|---|---|
| `loadFixture(name, options?)` | 新建一个 `MemoryFileSystem` 并写入 fixture 的全部文件。测试写入的内容不会影响别的测试 |
| `fixtureFiles(name)` | fixture 的全部文件（相对路径 → 文本），按路径排序；用来比较字节 |
| `FIXTURE_NAMES` | 所有 fixture 的名字 |

- 文件内容由 Vite 的 `import.meta.glob(..., { query: '?raw' })` 在测试启动时读入，**不用 `node:*`**。所以本包**不 build**，只能在 Vitest 里运行；fixture 里只能放 UTF-8 文本文件。
- dependency-cruiser 保证只有测试文件（`*.test.ts`）能 import 本包（README 第 6 节）。
- 新加 fixture：在 `fixtures/` 下建目录，把名字加进 `FIXTURE_NAMES`。
