import { expect } from 'vitest';

import type { PlatformErrorCode } from '../errors.js';

/** 断言 promise 以带指定错误码的 PlatformError 失败。只断言错误码，不断言提示文字。 */
export async function expectPlatformError(
  promise: Promise<unknown>,
  code: PlatformErrorCode,
): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: 'PlatformError', code });
}

/** 断言同步调用以带指定错误码的 PlatformError 失败。 */
export function expectPlatformErrorSync(
  fn: () => unknown,
  code: PlatformErrorCode,
): void {
  let thrown: unknown;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toMatchObject({ name: 'PlatformError', code });
}
