// 测试内部用的小工具：把校验结果转换成错误码列表。测试只断言错误码，不断言提示文字。
import type { z } from 'zod';

import { validate } from './index.js';

/** 用 {@link validate} 校验 input，返回所有错误的错误码；校验通过时返回空数组。 */
export function codesOf(schema: z.ZodType, input: unknown): string[] {
  const result = validate(schema, input);
  return result.success ? [] : result.issues.map((issue) => issue.code);
}

/** 用 {@link validate} 校验 input，返回所有错误的 `[路径, 错误码]`。 */
export function issuesOf(
  schema: z.ZodType,
  input: unknown,
): [string, string][] {
  const result = validate(schema, input);
  return result.success
    ? []
    : result.issues.map((issue) => [issue.path.join('.'), issue.code]);
}
