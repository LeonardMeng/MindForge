import type { Clock, IdGenerator } from '@mastery/platform';
import { IsoDateTime, Ulid } from '@mastery/schema';
import { monotonicFactory } from 'ulid';

/** 系统时钟，精确到秒（向下取整，ADR-0013）。 */
export class SystemClock implements Clock {
  now(): IsoDateTime {
    const seconds = Math.floor(Date.now() / 1000) * 1000;
    return IsoDateTime.parse(
      `${new Date(seconds).toISOString().slice(0, 19)}Z`,
    );
  }
}

/**
 * 基于 `ulid` 库的 ID 生成器。用单调工厂，同一毫秒内生成的 ID 也严格递增。
 */
export class NodeIdGenerator implements IdGenerator {
  readonly #next = monotonicFactory();

  ulid(): Ulid {
    return Ulid.parse(this.#next());
  }
}
