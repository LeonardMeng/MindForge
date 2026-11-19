import { describe, expect, it } from 'vitest';

import {
  isPlatformError,
  PLATFORM_ERROR_CODES,
  PlatformError,
} from './index.js';

describe('PlatformError', () => {
  it('carries a stable code and params', () => {
    const error = new PlatformError('platform.not_found', { path: 'a.md' });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PlatformError');
    expect(error.code).toBe('platform.not_found');
    expect(error.params).toEqual({ path: 'a.md' });
  });

  it('has a message for every code', () => {
    for (const code of PLATFORM_ERROR_CODES) {
      // 只确认能生成非空的提示，不断言具体措辞。
      expect(
        new PlatformError(code, { path: 'x' }).message.length,
      ).toBeGreaterThan(0);
    }
  });

  it('uses platform.* codes', () => {
    for (const code of PLATFORM_ERROR_CODES)
      expect(code).toMatch(/^platform\.[a-z_]+$/);
  });

  it('is recognized by isPlatformError, optionally by code', () => {
    const error = new PlatformError('platform.not_empty', { path: 'a' });
    expect(isPlatformError(error)).toBe(true);
    expect(isPlatformError(error, 'platform.not_empty')).toBe(true);
    expect(isPlatformError(error, 'platform.not_found')).toBe(false);
    expect(isPlatformError(new Error('x'))).toBe(false);
    expect(isPlatformError({ code: 'platform.not_found' })).toBe(false);
  });
});
