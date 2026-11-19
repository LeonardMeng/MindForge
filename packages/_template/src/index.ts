/**
 * 原样返回传入的值。
 *
 * 只是模板里的占位函数：复制模板创建新包后，把它换成真正的公共 API。
 *
 * @param value - 任意值
 * @returns 同一个值
 */
export function identity<T>(value: T): T {
  return value;
}
