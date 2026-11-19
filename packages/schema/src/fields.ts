// 本包内部共用的字段辅助函数，不从 index.ts 导出。
import { z } from 'zod';

import { pushIssue } from './errors.js';

/** 不能为空（也不能只有空白）的字符串。 */
export const NonEmptyString = z.string().check((ctx) => {
  if (ctx.value.trim() === '') {
    pushIssue(ctx, 'field.empty', {});
  }
});

/** 当前（也是唯一）支持的文件格式版本。读取旧版本文件要先经过迁移（1.6）。 */
export const SchemaVersionV1 = z.literal(1);

/**
 * 列表字段：每一项都按 `item` 校验，不能有重复项。
 *
 * - 写成单个字符串时（比如 `tags: ml`），报 `field.expected_list`，提示改成 `tags: [ml]`。
 * - 元素的错误和重复项会同时报出（zod 在元素出错时不会再运行数组级的检查，所以这里自己逐个校验）。
 *
 * @param field - 字段名，用在提示的示例里
 * @param item - 每一项的 schema
 */
export function listOf<T extends z.ZodType>(field: string, item: T) {
  return z
    .unknown()
    .check((ctx) => {
      const value = ctx.value;
      if (typeof value === 'string') {
        pushIssue(ctx, 'field.expected_list', { field, value });
        return;
      }
      // 不是数组时交给后面的 z.array 报 field.invalid_type 或 field.required。
      if (!Array.isArray(value)) return;
      const seen = new Set<string>();
      value.forEach((element: unknown, index) => {
        const result = item.safeParse(element, { reportInput: true });
        if (!result.success) {
          for (const issue of result.error.issues) {
            // 把元素的错误原样转交，路径前面加上下标。zod 的 issue 和 raw issue 类型不完全一致，需要断言。
            ctx.issues.push({
              ...issue,
              path: [index, ...issue.path],
            } as z.core.$ZodRawIssue);
          }
          return;
        }
        const key = JSON.stringify(element);
        if (seen.has(key)) {
          pushIssue(ctx, 'field.duplicate_item', { value: element }, [index]);
        } else {
          seen.add(key);
        }
      });
    })
    .pipe(z.array(item));
}
