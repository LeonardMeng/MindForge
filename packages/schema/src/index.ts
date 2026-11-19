/**
 * @packageDocumentation
 * Mastery OS 的文件协议：zod schema、推导出的类型和结构化的校验错误。
 *
 * 本包是纯定义：不依赖任何内部包，不做 I/O，不依赖 Node（ADR-0012）。
 */

export {
  formatSchemaError,
  SCHEMA_ERROR_CODES,
  toSchemaIssues,
  type SchemaErrorCode,
  type SchemaErrorParams,
  type SchemaIssue,
} from './errors.js';
export {
  formatGlobalConceptRef,
  GlobalConceptRef,
  IsoDateTime,
  parseGlobalConceptRef,
  SchemaVersion,
  Slug,
  Ulid,
} from './ids.js';
export {
  DIMENSIONS,
  DimensionScore,
  DimensionScores,
  type Dimension,
} from './dimensions.js';
