/**
 * 操作的结果：成功时带值，失败时带错误。领域规则不允许的情况用它返回，不抛出；
 * I/O 错误（后端坏了）照常抛出。
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** 成功的结果。 */
export function ok<T>(value: T): { readonly ok: true; readonly value: T } {
  return { ok: true, value };
}

/** 失败的结果。 */
export function err<E>(error: E): { readonly ok: false; readonly error: E } {
  return { ok: false, error };
}
