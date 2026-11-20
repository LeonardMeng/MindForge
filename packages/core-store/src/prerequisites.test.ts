/**
 * 2.6 用 fixture 的依赖图测试（真实的 store）。ws-transformers 的依赖：
 *
 * transformer → multi-head-attention → self-attention → matrix-multiplication、softmax、embedding
 *             → positional-encoding → embedding → matrix-multiplication
 *             → layer-normalization → probability
 *             → residual-connection
 * softmax → probability
 */
import { prerequisiteRisks } from '@mastery/core';
import type { IsoDateTime, MasteryState } from '@mastery/schema';
import type { MemoryFileSystem } from '@mastery/platform-memory';
import { createStore } from '@mastery/store';
import { loadFixture } from '@mastery/testkit';
import { describe, expect, it } from 'vitest';

import { createStoreRepository } from './index.js';
import { fileSeed, put } from './test-helpers.js';

/** 测试用的固定时钟（2.7 起 prerequisiteRisks 要用 clock）。 */
const CLOCK = { now: () => '2026-12-01T00:00:00Z' as IsoDateTime };

const NULLS = {
  recall: null,
  understanding: null,
  reasoning: null,
  application: null,
  transfer: null,
};

async function workspace(
  states: Record<string, MasteryState> = {},
): Promise<MemoryFileSystem> {
  const fs = await loadFixture('ws-transformers');
  for (const [id, state] of Object.entries(states)) {
    await fileSeed(fs).mastery(id, {
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
  }
  return fs;
}

async function risks(fs: MemoryFileSystem, id: string) {
  const result = await prerequisiteRisks(
    { repository: createStoreRepository(createStore(fs)), clock: CLOCK },
    id,
  );
  if (!result.ok) throw new Error(result.error.code);
  return result.value.map(
    (r) =>
      `${r.depth} ${r.conceptId} via [${r.via.join(' > ')}] ${r.reason.kind === 'state' ? r.reason.state : r.reason.kind}`,
  );
}

describe('prerequisiteRisks on the ws-transformers dependency graph', () => {
  it('with no projections, every concept transformer depends on is a risk, once, at its shortest depth', async () => {
    expect(await risks(await workspace(), 'transformer')).toEqual([
      '1 layer-normalization via [] not_assessed',
      '1 multi-head-attention via [] not_assessed',
      '1 positional-encoding via [] not_assessed',
      '1 residual-connection via [] not_assessed',
      '2 embedding via [positional-encoding] not_assessed',
      '2 probability via [layer-normalization] not_assessed',
      '2 self-attention via [multi-head-attention] not_assessed',
      '3 matrix-multiplication via [multi-head-attention > self-attention] not_assessed',
      '3 softmax via [multi-head-attention > self-attention] not_assessed',
    ]);
  });

  it('mastered self-attention prunes softmax; probability stays through the weak layer-normalization', async () => {
    const fs = await workspace({
      'self-attention': 'mastered',
      'layer-normalization': 'learning',
      'multi-head-attention': 'learning',
    });
    expect(await risks(fs, 'transformer')).toEqual([
      '1 layer-normalization via [] learning',
      '1 multi-head-attention via [] learning',
      '1 positional-encoding via [] not_assessed',
      '1 residual-connection via [] not_assessed',
      '2 embedding via [positional-encoding] not_assessed',
      '2 probability via [layer-normalization] not_assessed',
      // matrix-multiplication：self-attention 被剪掉了，还能通过 positional-encoding > embedding 到达。
      '3 matrix-multiplication via [positional-encoding > embedding] not_assessed',
    ]);
  });

  it('probability disappears too once layer-normalization is also safe', async () => {
    const fs = await workspace({
      'self-attention': 'mastered',
      'layer-normalization': 'provisional_mastery',
    });
    const found = await risks(fs, 'transformer');
    expect(found.some((line) => line.includes(' probability '))).toBe(false);
    expect(found.some((line) => line.includes(' softmax '))).toBe(false);
  });

  it('only mastered concepts below transformer leave nothing to report', async () => {
    const fs = await workspace({
      'multi-head-attention': 'mastered',
      'positional-encoding': 'mastered',
      'layer-normalization': 'mastered',
      'residual-connection': 'provisional_mastery',
    });
    expect(await risks(fs, 'transformer')).toEqual([]);
  });

  it('self-attention: probability is reached through softmax', async () => {
    const fs = await workspace({
      softmax: 'diagnosed',
      'matrix-multiplication': 'mastered',
      embedding: 'mastered',
    });
    expect(await risks(fs, 'self-attention')).toEqual([
      '1 softmax via [] diagnosed',
      '2 probability via [softmax] not_assessed',
    ]);
  });

  it('reports a dangling prerequisite and a broken projection', async () => {
    const fs = await workspace();
    await fileSeed(fs).concept('residual-connection', {
      schema_version: 1,
      id: 'residual-connection',
      name: 'Residual Connection',
      prerequisites: ['ghost'],
      status: 'active',
    });
    await put(fs, 'mastery/layer-normalization.yaml', 'state: [\n');
    const found = await risks(fs, 'transformer');
    expect(found).toContain('1 layer-normalization via [] mastery_unreadable');
    expect(found).toContain(
      '2 ghost via [residual-connection] concept_missing',
    );
    // 投影读不了的 layer-normalization 照样往下找。
    expect(found).toContain(
      '2 probability via [layer-normalization] not_assessed',
    );
  });
});
