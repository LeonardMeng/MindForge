import type { IsoDateTime, MasteryState } from '@mastery/schema';
import { describe, expect, it } from 'vitest';

import { prerequisiteRisks, RISKY_STATES } from './index.js';
import {
  createMemoryRepository,
  type MemoryRepository,
} from './testing/index.js';

/** 测试用的固定时钟（2.7 起 prerequisiteRisks 要用 clock）。 */
const NOW = '2026-12-01T00:00:00Z';
const CLOCK = { now: () => NOW as IsoDateTime };

const NULLS = {
  recall: null,
  understanding: null,
  reasoning: null,
  application: null,
  transfer: null,
};

const concept = (
  id: string,
  prerequisites: string[] = [],
  status = 'active',
) => ({
  schema_version: 1,
  id,
  name: id,
  prerequisites,
  status,
});

const projection = (id: string, state: MasteryState) => ({
  schema_version: 1,
  concept_id: id,
  state,
  dimensions: NULLS,
  confidence: 0,
  review_due_at: null,
  rules_version: 1,
  evidence_ids: [],
  explanation: [{ code: `state.${state}`, params: {} }],
});

/** 图：`{ slug: [前置依赖] }`；状态：`{ slug: state }`（没写的没有投影）。 */
async function graph(
  edges: Record<string, string[]>,
  states: Record<string, MasteryState> = {},
): Promise<MemoryRepository> {
  const memory = createMemoryRepository();
  for (const [id, prerequisites] of Object.entries(edges)) {
    await memory.seed.concept(id, concept(id, prerequisites));
  }
  for (const [id, state] of Object.entries(states)) {
    await memory.seed.mastery(id, projection(id, state));
  }
  return memory;
}

async function risks(memory: MemoryRepository, id: string) {
  const result = await prerequisiteRisks(
    { repository: memory.repository, clock: CLOCK },
    id,
  );
  if (!result.ok) throw new Error(result.error.code);
  return result.value.map((r) => ({
    id: r.conceptId,
    depth: r.depth,
    via: r.via.join('>'),
    reason: r.reason.kind === 'state' ? r.reason.state : r.reason.kind,
  }));
}

describe('prerequisiteRisks', () => {
  it('risky states are not_assessed, diagnosed, learning, needs_review', () => {
    expect(RISKY_STATES).toEqual([
      'not_assessed',
      'diagnosed',
      'learning',
      'needs_review',
    ]);
  });

  it('reports each risky state; a missing projection counts as not_assessed', async () => {
    const memory = await graph(
      { a: ['b', 'c', 'd', 'e'], b: [], c: [], d: [], e: [] },
      { b: 'diagnosed', c: 'learning', d: 'needs_review' },
    );
    expect(await risks(memory, 'a')).toEqual([
      { id: 'b', depth: 1, via: '', reason: 'diagnosed' },
      { id: 'c', depth: 1, via: '', reason: 'learning' },
      { id: 'd', depth: 1, via: '', reason: 'needs_review' },
      { id: 'e', depth: 1, via: '', reason: 'not_assessed' },
    ]);
  });

  it('safe states are not reported and pruned (nothing below them is walked)', async () => {
    const memory = await graph(
      { a: ['b', 'c'], b: ['x'], c: ['y'], x: [], y: [] },
      { b: 'mastered', c: 'provisional_mastery' },
    );
    expect(await risks(memory, 'a')).toEqual([]);
  });

  it('a concept below a safe node is still reported through another, risky path', async () => {
    const memory = await graph(
      { a: ['b', 'c'], b: ['x'], c: ['d'], d: ['x'], x: [] },
      { b: 'mastered', c: 'learning', d: 'learning' },
    );
    expect(await risks(memory, 'a')).toEqual([
      { id: 'c', depth: 1, via: '', reason: 'learning' },
      { id: 'd', depth: 2, via: 'c', reason: 'learning' },
      { id: 'x', depth: 3, via: 'c>d', reason: 'not_assessed' },
    ]);
  });

  it('walks through risky and unreadable-projection nodes', async () => {
    const memory = await graph({ a: ['b'], b: ['c'], c: [] });
    await memory.seed.mastery('b', {
      ...projection('b', 'learning'),
      confidence: 7,
    });
    expect(await risks(memory, 'a')).toEqual([
      { id: 'b', depth: 1, via: '', reason: 'mastery_unreadable' },
      { id: 'c', depth: 2, via: 'b', reason: 'not_assessed' },
    ]);
  });

  it('marks a projection from a newer version as tooNew', async () => {
    const memory = await graph({ a: ['b'], b: [] });
    await memory.seed.mastery('b', { schema_version: 99, concept_id: 'b' });
    const result = await prerequisiteRisks(
      { repository: memory.repository, clock: CLOCK },
      'a',
    );
    expect(result.ok && result.value[0]?.reason).toEqual({
      kind: 'mastery_unreadable',
      tooNew: true,
    });
  });

  it('reports a dangling prerequisite and an unreadable concept, and cannot walk below them', async () => {
    const memory = await graph({ a: ['b', 'ghost'], b: ['c'], c: [] });
    await memory.seed.concept('b', { ...concept('b', ['c']), name: '' });
    expect(await risks(memory, 'a')).toEqual([
      { id: 'b', depth: 1, via: '', reason: 'concept_unreadable' },
      { id: 'ghost', depth: 1, via: '', reason: 'concept_missing' },
    ]);
  });

  it('reports each concept once, at its shortest depth, with the first path by slug', async () => {
    const memory = await graph({
      a: ['c', 'b', 'x'],
      b: ['z'],
      c: ['z'],
      x: ['y'],
      y: ['b'],
      z: [],
    });
    expect(await risks(memory, 'a')).toEqual([
      { id: 'b', depth: 1, via: '', reason: 'not_assessed' },
      { id: 'c', depth: 1, via: '', reason: 'not_assessed' },
      { id: 'x', depth: 1, via: '', reason: 'not_assessed' },
      { id: 'y', depth: 2, via: 'x', reason: 'not_assessed' },
      { id: 'z', depth: 2, via: 'b', reason: 'not_assessed' },
    ]);
  });

  it('stops at cycles, including back to the concept itself', async () => {
    const memory = await graph({ a: ['b'], b: ['c'], c: ['a', 'b'] });
    expect(await risks(memory, 'a')).toEqual([
      { id: 'b', depth: 1, via: '', reason: 'not_assessed' },
      { id: 'c', depth: 2, via: 'b', reason: 'not_assessed' },
    ]);
  });

  it('treats archived and draft prerequisites by their state', async () => {
    const memory = createMemoryRepository();
    await memory.seed.concept('a', concept('a', ['b', 'c']));
    await memory.seed.concept('b', concept('b', [], 'archived'));
    await memory.seed.concept('c', concept('c', [], 'draft'));
    await memory.seed.mastery('c', projection('c', 'mastered'));
    expect(await risks(memory, 'a')).toEqual([
      { id: 'b', depth: 1, via: '', reason: 'not_assessed' },
    ]);
  });

  it('a mastered prerequisite that is due for review is a risk and is not pruned (2.7)', async () => {
    const memory = await graph({ a: ['b'], b: ['c'], c: [] });
    await memory.seed.mastery('b', {
      ...projection('b', 'mastered'),
      review_due_at: NOW,
    });
    const result = await prerequisiteRisks(
      { repository: memory.repository, clock: CLOCK },
      'a',
    );
    expect(result.ok && result.value).toEqual([
      {
        conceptId: 'b',
        depth: 1,
        via: [],
        reason: { kind: 'review_due', dueAt: NOW },
      },
      {
        conceptId: 'c',
        depth: 2,
        via: ['b'],
        reason: { kind: 'state', state: 'not_assessed' },
      },
    ]);
  });

  it('a mastered prerequisite not yet due is still pruned', async () => {
    const memory = await graph({ a: ['b'], b: ['c'], c: [] });
    await memory.seed.mastery('b', {
      ...projection('b', 'mastered'),
      review_due_at: '2026-12-01T00:00:01Z',
    });
    expect(await risks(memory, 'a')).toEqual([]);
  });

  it('returns nothing for a concept without prerequisites', async () => {
    expect(await risks(await graph({ a: [] }), 'a')).toEqual([]);
  });

  it('the concept itself missing or unreadable is an error', async () => {
    const missing = await prerequisiteRisks(
      { repository: createMemoryRepository().repository, clock: CLOCK },
      'a',
    );
    expect(missing.ok ? null : missing.error.code).toBe(
      'core.concept_not_found',
    );
    const memory = createMemoryRepository();
    await memory.seed.concept('a', { ...concept('a'), name: '' });
    const unreadable = await prerequisiteRisks(
      { repository: memory.repository, clock: CLOCK },
      'a',
    );
    expect(unreadable.ok ? null : unreadable.error.code).toBe(
      'core.concept_unreadable',
    );
  });

  it('writes nothing', async () => {
    const memory = await graph({ a: ['b'], b: [] });
    await prerequisiteRisks(
      { repository: memory.repository, clock: CLOCK },
      'a',
    );
    expect(await memory.repository.getMastery('b')).toEqual({
      kind: 'missing',
    });
  });
});
