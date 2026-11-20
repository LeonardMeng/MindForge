// core 只能用 platform 的类型：这是允许的。
import type { Clock } from '../../platform/src/index.js';

export type UsesClock = Clock;
