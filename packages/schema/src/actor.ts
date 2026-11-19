import { z } from 'zod';

import { MODEL_REF_PATTERN, patternMeta } from './constraints.js';
import { pushIssue } from './errors.js';
import { taggedUnion } from './fields.js';
import { Slug } from './ids.js';

/** 模型引用：`<provider>:<model>`，例如 `ollama:qwen3-14b`。provider 是 slug，model 不能有空白。 */
export const ModelRef = z
  .string()
  .check((ctx) => {
    if (!MODEL_REF_PATTERN.test(ctx.value)) {
      pushIssue(ctx, 'actor.invalid_model', { value: ctx.value });
    }
  })
  .meta(patternMeta(MODEL_REF_PATTERN));

const AgentActor = z.strictObject({
  kind: z.literal('agent'),
  /** agent 的插件名，例如 `agent-evaluator`。 */
  id: Slug,
  /** 使用的模型，例如 `ollama:qwen3-14b`。 */
  model: ModelRef,
});

const HumanActor = z.strictObject({
  kind: z.literal('human'),
});

/**
 * 谁产生了这条数据：agent（插件名 + 模型），或者 human（用户本人）。
 *
 * 用于 Evidence 的 `evaluator`，以及 Blindspot、Intervention、Proposal 的 `source`。
 */
export const Actor = taggedUnion(
  'kind',
  { agent: AgentActor, human: HumanActor },
  z.discriminatedUnion('kind', [AgentActor, HumanActor]),
);
/** 谁产生了这条数据。 */
export type Actor = z.infer<typeof Actor>;
