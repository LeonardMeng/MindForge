import { describe, expect, it } from 'vitest';

import { identity } from './index.js';

describe('identity', () => {
  it('原样返回传入的值', () => {
    const obj = { a: 1 };
    expect(identity(obj)).toBe(obj);
    expect(identity(null)).toBeNull();
  });
});
