import { describe, expect, it } from 'vitest';

import { Actor, Evaluator } from './index.js';
import { codesOf, issuesOf } from './test-helpers.js';

describe('Actor', () => {
  it.each([
    { kind: 'agent', id: 'agent-teacher', model: 'ollama:qwen3-14b' },
    { kind: 'human' },
  ])('accepts %j', (actor) => {
    expect(codesOf(Actor, actor)).toEqual([]);
  });

  it('rejects an invalid model reference', () => {
    expect(
      issuesOf(Actor, { kind: 'agent', id: 'agent-teacher', model: 'qwen3' }),
    ).toEqual([['model', 'actor.invalid_model']]);
  });

  it('rejects an unknown kind', () => {
    expect(issuesOf(Actor, { kind: 'system' })).toEqual([
      ['kind', 'field.invalid_option'],
    ]);
  });

  it('is the same schema as Evaluator', () => {
    expect(Evaluator).toBe(Actor);
  });
});
