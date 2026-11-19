import { z } from 'zod';

import { pushIssue } from './errors.js';
import { taggedUnion } from './fields.js';
import { Slug } from './ids.js';

/** 模型引用：`<provider>:<model>`，provider 遵守 Slug 规则，model 不能有空白。 */
const MODEL_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*:\S+$/;

/** 模型引用，例如 `ollama:qwen3-14b`。 */
export const ModelRef = z.string().check((ctx) => {
  if (!MODEL_PATTERN.test(ctx.value)) {
    pushIssue(ctx, 'actor.invalid_model', { value: ctx.value });
  }
});

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
