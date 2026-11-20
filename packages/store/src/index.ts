/**
 * @packageDocumentation
 * 按类型读写 Workspace 里的所有文件（ROADMAP 1.9）：
 * 读的时候解析、迁移、校验；写的时候原子写，只改动变化的部分；Evidence 和评测会话只能追加。
 * 所有 I/O 都通过 Platform 的 FileSystem 端口。
 */
export {
  createStore,
  type AppendOnlyCollection,
  type Concept,
  type EditableCollection,
  type EditableFile,
  type HistoryFiles,
  type ListResult,
  type MasteryFiles,
  type ReadResult,
  type SaveOptions,
  type Snapshot,
  type Store,
  type StoreOptions,
  type WriteResult,
} from './store.js';
export {
  formatStoreIssue,
  fromRawIssue,
  STORE_ERROR_CODES,
  type StoreErrorCode,
  type RawIssue,
  type StoreIssue,
} from './errors.js';
export {
  parseYaml,
  patchYaml,
  stringifyYaml,
  type YamlParsed,
  type YamlParseResult,
} from './yaml.js';
