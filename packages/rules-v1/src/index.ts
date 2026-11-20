/**
 * @packageDocumentation
 * 掌握度规则 v1（参数见 ADR-0007，暂定）：维度聚合（2.3）和状态机（2.4）。
 * 只依赖 `schema` 和 `core` 的规则接口（类型）。
 */
import type { Rules } from '@mastery/core';

import { aggregateV1 } from './aggregate.js';
import { evaluateV1 } from './evaluate.js';

export { aggregateV1, V1_PARAMETERS } from './aggregate.js';
export {
  conditionsOf,
  evaluateV1,
  isPassingVerification,
  type Conditions,
} from './evaluate.js';
export {
  EXPLANATION_CODES,
  formatExplanation,
  type ExplanationCode,
} from './explanation.js';

/** 规则 v1，注册到 RulesRegistry 用。 */
export const rulesV1: Rules = Object.freeze({
  version: 1,
  aggregate: aggregateV1,
  evaluate: evaluateV1,
});
