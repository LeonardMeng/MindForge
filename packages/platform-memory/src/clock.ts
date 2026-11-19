import type { Clock } from '@mastery/platform';
import { IsoDateTime } from '@mastery/schema';

/** 默认的起始时间。 */
const DEFAULT_START = '2026-01-01T00:00:00Z';

/**
 * 假时钟：时间只在调用 {@link FakeClock.set} 或 {@link FakeClock.advance} 时变化，
 * 测试结果因此可以复现。内部按毫秒计时，`now()` 按 ADR-0013 精确到秒（向下取整）。
 */
export class FakeClock implements Clock {
  #ms: number;

  /** @param start - 起始时间，格式 `YYYY-MM-DDTHH:mm:ssZ` */
  constructor(start: string = DEFAULT_START) {
    this.#ms = Date.parse(IsoDateTime.parse(start));
  }

  /** 当前时间，精确到秒。 */
  now(): IsoDateTime {
    const seconds = Math.floor(this.#ms / 1000) * 1000;
    return IsoDateTime.parse(
      `${new Date(seconds).toISOString().slice(0, 19)}Z`,
    );
  }

  /** 把时间设到指定时刻（可以往回设）。 */
  set(time: string): void {
    this.#ms = Date.parse(IsoDateTime.parse(time));
  }

  /** 把时间往前拨 `ms` 毫秒。 */
  advance(ms: number): void {
    this.#ms += ms;
  }
}
