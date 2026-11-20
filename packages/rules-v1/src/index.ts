/**
 * @packageDocumentation
 * 掌握度规则 v1（参数见 ADR-0007，暂定）。2.3 是维度聚合，2.4 加状态机。
 * 只依赖 `schema` 和 `core` 的规则接口（类型）。
 */
import type { Rules } from '@mastery/core';

import { aggregateV1 } from './aggregate.js';

export { aggregateV1, V1_PARAMETERS } from './aggregate.js';

/** 规则 v1，注册到 RulesRegistry 用。 */
export const rulesV1: Rules = Object.freeze({
  version: 1,
  aggregate: aggregateV1,
});
