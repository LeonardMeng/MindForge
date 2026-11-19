import { IsoDateTime, Ulid } from '@mastery/schema';
import { describe, expect, it } from 'vitest';

import type { Clock, IdGenerator, Lock } from '../ports.js';
import { expectPlatformError } from './helpers.js';

/**
 * Clock 的契约测试。
 *
 * @param name - 实现的名字
 * @param create - 每个测试调用一次
 */
export function describeClockContract(name: string, create: () => Clock): void {
  describe(`Clock contract: ${name}`, () => {
    it('returns a UTC timestamp with second precision', () => {
      expect(IsoDateTime.safeParse(create().now()).success).toBe(true);
    });

    it('never goes backwards between two calls', () => {
      const clock = create();
      const first = clock.now();
      const second = clock.now();
      expect(second >= first).toBe(true);
    });
  });
}

/**
 * IdGenerator 的契约测试。
 *
 * @param name - 实现的名字
 * @param create - 每个测试调用一次
 */
export function describeIdGeneratorContract(
  name: string,
  create: () => IdGenerator,
): void {
  describe(`IdGenerator contract: ${name}`, () => {
    it('generates valid, strictly increasing ULIDs, even within the same second', () => {
      const ids = create();
      const generated = Array.from({ length: 1000 }, () => ids.ulid());
      for (const id of generated)
        expect(Ulid.safeParse(id).success, id).toBe(true);
      for (let index = 1; index < generated.length; index++) {
        const previous = generated[index - 1] ?? '';
        const current = generated[index] ?? '';
        expect(current > previous, `${current} > ${previous}`).toBe(true);
      }
    });
  });
}

/** Lock 的契约测试的被测对象：同一个锁空间的两个独立入口（模拟两个进程）。 */
export interface LockContractSubject {
  readonly first: Lock;
  readonly second: Lock;
}

/**
 * Lock 的契约测试。
 *
 * @param name - 实现的名字
 * @param create - 每个测试调用一次
 */
export function describeLockContract(
  name: string,
  create: () => LockContractSubject | Promise<LockContractSubject>,
): void {
  describe(`Lock contract: ${name}`, () => {
    it('acquires and releases a lock', async () => {
      const { first } = await create();
      const handle = await first.acquire('write');
      await handle.release();
      const again = await first.acquire('write');
      await again.release();
    });

    it('makes the second holder wait until the first releases', async () => {
      const { first, second } = await create();
      const order: string[] = [];
      const held = await first.acquire('write');
      const waiting = second
        .acquire('write', { timeoutMs: 5000 })
        .then((handle) => {
          order.push('second acquired');
          return handle;
        });
      await Promise.resolve();
      order.push('first releasing');
      await held.release();
      const handle = await waiting;
      expect(order).toEqual(['first releasing', 'second acquired']);
      await handle.release();
    });

    it('times out with platform.lock_timeout', async () => {
      const { first, second } = await create();
      const held = await first.acquire('write');
      await expectPlatformError(
        second.acquire('write', { timeoutMs: 50 }),
        'platform.lock_timeout',
      );
      await held.release();
    });

    it('can be acquired again after a waiter timed out', async () => {
      const { first, second } = await create();
      const held = await first.acquire('write');
      await expectPlatformError(
        second.acquire('write', { timeoutMs: 20 }),
        'platform.lock_timeout',
      );
      await held.release();
      const handle = await second.acquire('write', { timeoutMs: 1000 });
      await handle.release();
    });

    it('does not block locks with different names', async () => {
      const { first, second } = await create();
      const a = await first.acquire('write');
      const b = await second.acquire('index', { timeoutMs: 1000 });
      await a.release();
      await b.release();
    });

    it('can be released twice', async () => {
      const { first } = await create();
      const handle = await first.acquire('write');
      await handle.release();
      await handle.release();
    });

    it.each(['', 'a/b', '../x', 'CON', 'a?'])(
      'rejects the lock name %j',
      async (lockName) => {
        const { first } = await create();
        await expectPlatformError(
          first.acquire(lockName),
          'platform.invalid_path',
        );
      },
    );
  });
}
