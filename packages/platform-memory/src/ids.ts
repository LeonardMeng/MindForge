import type { Clock, IdGenerator } from '@mastery/platform';
import { Ulid } from '@mastery/schema';

/** Crockford Base32。 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 把非负整数编码成定长的 Crockford Base32。 */
function encode(value: number, length: number): string {
  let out = '';
  let rest = value;
  for (let index = 0; index < length; index++) {
    out = ALPHABET.charAt(rest % 32) + out;
    rest = Math.floor(rest / 32);
  }
  return out;
}

/**
 * 确定性的 ULID 生成器，测试用：时间部分来自时钟，随机部分换成计数器。
 * 同一个生成器生成的 ID 严格递增，时钟往回设也一样。不需要 ULID 库。
 */
export class MemoryIdGenerator implements IdGenerator {
  readonly #clock: Clock;
  #lastTime = -1;
  #counter = 0;

  /** @param clock - 提供时间部分的时钟 */
  constructor(clock: Clock) {
    this.#clock = clock;
  }

  ulid(): Ulid {
    const time = Date.parse(this.#clock.now());
    if (time > this.#lastTime) {
      this.#lastTime = time;
      this.#counter = 0;
    } else {
      this.#counter++;
    }
    return Ulid.parse(encode(this.#lastTime, 10) + encode(this.#counter, 16));
  }
}
