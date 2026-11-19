// 测试和 fixture 用的简短构造函数。内部仍然经过 parse，值不合法时直接抛错。
// 不从包的公共 API（src/index.ts）导出。
import { GlobalConceptRef, IsoDateTime, Slug, Ulid } from './ids.js';

/** 构造一个 {@link Slug}，不合法时抛错。 */
export const slug = (value: string): Slug => Slug.parse(value);

/** 构造一个 {@link GlobalConceptRef}，不合法时抛错。 */
export const globalConceptRef = (value: string): GlobalConceptRef =>
  GlobalConceptRef.parse(value);

/** 构造一个 {@link Ulid}，不合法时抛错。 */
export const ulid = (value: string): Ulid => Ulid.parse(value);

/** 构造一个 {@link IsoDateTime}，不合法时抛错。 */
export const isoDateTime = (value: string): IsoDateTime =>
  IsoDateTime.parse(value);
