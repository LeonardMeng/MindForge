/**
 * 2.7 的验收：用假时钟测试一年内的复习序列（真实的 store、fixture 和规则 v1）。
 * 学习者掌握 softmax 之后，每到复习时刻就做一次通过的独立验证，然后重算。
 */
import {
  recalculate,
  reviewStatus,
  submitEvidence,
  type Ports,
} from '@mastery/core';
import {
  createEventRecorder,
  createRulesRegistry,
} from '@mastery/core/testing';
import { FakeClock, type MemoryFileSystem } from '@mastery/platform-memory';
import { rulesV1 } from '@mastery/rules-v1';
import type { IsoDateTime, MasteryProjection } from '@mastery/schema';
import { createStore } from '@mastery/store';
import { loadFixture } from '@mastery/testkit';
import { describe, expect, it } from 'vitest';

import { createStoreRepository } from './index.js';
import { allFiles } from './test-helpers.js';

const DAY_MS = 86_400_000;
const START = Date.parse('2026-11-01T09:00:00Z');
const iso = (ms: number) =>
  new Date(ms).toISOString().replace('.000Z', 'Z') as IsoDateTime;
const NULLS = {
  recall: null,
  understanding: null,
  reasoning: null,
  application: null,
  transfer: null,
};

class Learner {
  private n = 0;
  constructor(
    readonly fs: MemoryFileSystem,
    readonly clock: FakeClock,
    readonly ports: Ports,
  ) {}

  static async create(): Promise<Learner> {
    const fs = await loadFixture('ws-transformers');
    const clock = new FakeClock(iso(START));
    const ports: Ports = {
      repository: createStoreRepository(createStore(fs)),
      clock,
      events: createEventRecorder(),
      rules: createRulesRegistry([rulesV1]),
    };
    return new Learner(fs, clock, ports);
  }

  /** 在当前时刻做一次通过的独立验证（softmax 的三个考察维度），然后重算。 */
  async verify(): Promise<void> {
    const id = `01JD3K8Q8Z6V7X2N4M5P9R${String(this.n++).padStart(4, '0')}`;
    const submitted = await submitEvidence(this.ports, {
      schema_version: 1,
      id,
      concept_id: 'softmax',
      session_id: null,
      assessment_type: 'independent_verification',
      criteria_version: 1,
      dimensions: {
        ...NULLS,
        recall: 0.9,
        understanding: 0.8,
        application: 0.7,
      },
      confidence: 0.9,
      evaluator: { kind: 'human' },
      note: 'review',
      created_at: this.clock.now(),
    });
    expect(submitted.ok).toBe(true);
    expect((await recalculate(this.ports, 'softmax')).ok).toBe(true);
  }

  async projection(): Promise<MasteryProjection> {
    const read = await createStore(this.fs).mastery.read('softmax');
    if (read === null || !read.ok) throw new Error('no readable projection');
    return read.value;
  }

  goTo(ms: number): void {
    this.clock.set(iso(ms));
  }
}

/** 掌握，然后整整一年每到复习时刻就复习一次；返回每次的 review_due_at（相对开始的天数）。 */
async function year(options: { earlyCheck?: boolean } = {}): Promise<number[]> {
  const learner = await Learner.create();
  await learner.verify();
  learner.goTo(START + 7 * DAY_MS);
  await learner.verify();
  expect((await learner.projection()).state).toBe('mastered');

  const dues: number[] = [];
  for (;;) {
    const projection = await learner.projection();
    const dueAt = projection.review_due_at;
    if (dueAt === null) throw new Error('mastered without a review date');
    const dueMs = Date.parse(dueAt);
    if (dueMs > START + 365 * DAY_MS) break;
    dues.push((dueMs - START) / DAY_MS);

    if (options.earlyCheck) {
      // 刚复习过不久（不到当前间隔的一半）又做了一次验证：参与分数，但不改变复习序列。
      learner.goTo(Date.parse(learner.clock.now()) + DAY_MS);
      await learner.verify();
      expect((await learner.projection()).review_due_at).toBe(dueAt);
    }

    // 到期前一秒：不到期；到期时：读取时是 needs_review，文件不变。
    learner.goTo(dueMs - 1000);
    expect(reviewStatus(projection, learner.clock.now())).toMatchObject({
      due: false,
      effectiveState: 'mastered',
    });
    learner.goTo(dueMs);
    const before = await allFiles(learner.fs);
    expect(reviewStatus(projection, learner.clock.now())).toMatchObject({
      due: true,
      effectiveState: 'needs_review',
    });
    expect(await allFiles(learner.fs)).toEqual(before);
    expect((await learner.projection()).state).toBe('mastered');

    await learner.verify();
  }
  return dues;
}

describe('review scheduling over one year (fake clock)', () => {
  it('reviewing at each due date gives the intervals 7, 14, 30, 60, 120, 180 days', async () => {
    // 第 7 天进入 mastered；之后每个 review_due_at 是上一个加上下一级间隔。
    expect(await year()).toEqual([14, 28, 58, 118, 238]);
  });

  it('an early verification (before half the interval) leaves the sequence unchanged', async () => {
    expect(await year({ earlyCheck: true })).toEqual(await year());
  });
});
