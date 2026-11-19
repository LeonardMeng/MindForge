// 测试内部用的小工具：把校验结果转换成错误码列表。测试只断言错误码，不断言提示文字。
import type { z } from 'zod';

import { toSchemaIssues } from './index.js';

/** 校验 input，返回所有错误的错误码；校验通过时返回空数组。 */
export function codesOf(schema: z.ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);
  return result.success
    ? []
    : toSchemaIssues(result.error).map((issue) => issue.code);
}
