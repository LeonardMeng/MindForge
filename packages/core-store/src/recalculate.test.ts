/**
 * 2.5 的端到端测试：真实的 store、ws-transformers fixture 和规则 v1。
 * 不变量 3：同样的证据、criteria 和规则，投影**和历史**逐字节相同；不变量 9：拒绝时什么都不变。
 */
import { recalculate, submitEvidence, type Ports } from '@mastery/core';
import {
  createEventRecorder,
  createRulesRegistry,
} from '@mastery/core/testing';
import { FakeClock, type MemoryFileSystem } from '@mastery/platform-memory';
import { rulesV1 } from '@mastery/rules-v1';
import { createStore } from '@mastery/store';
import { loadFixture } from '@mastery/testkit';
import { describe, expect, it } from 'vitest';

import { createStoreRepository } from './index.js';
import { allFiles, fileSeed, put } from './test-helpers.js';

const NULLS = {
  recall: null,
  understanding: null,
  reasoning: null,
  application: null,
  transfer: null,
};
const ulid = (n: number) =>
  `01JD3K8Q8Z6V7X2N4M5P9R${String(n).padStart(4, '0')}`;
const PROJECTION = 'mastery/softmax.yaml';
const HISTORY = 'mastery/history/softmax.jsonl';

/** softmax 的证据（criteria v1：recall 0.8、understanding 0.7、application 0.6）。 */
function evidence(
  n: number,
  day: number,
  scores: Record<string, number>,
  type = 'independent_verification',
) {
  return {
    schema_version: 1,
    id: ulid(n),
    concept_id: 'softmax',
    session_id: null,
    assessment_type: type,
    criteria_version: 1,
    dimensions: { ...NULLS, ...scores },
    confidence: 0.9,
    evaluator: { kind: 'human' },
    note: 'test',
    created_at: `2026-11-${String(day).padStart(2, '0')}T09:00:00Z`,
  };
}

const FULL = { recall: 0.9, understanding: 0.8, application: 0.7 };
/** 诊断 → 练习 → 两次相隔 7 天的通过的独立验证。 */
const STORY = [
  evidence(0, 1, { recall: 0.5 }, 'self_assessment'),
  evidence(1, 2, { recall: 0.7, application: 0.5 }, 'practice'),
  evidence(2, 3, FULL),
  evidence(3, 10, FULL),
];

async function workspace(
  list: readonly ReturnType<typeof evidence>[] = [],
): Promise<{
  fs: MemoryFileSystem;
  ports: Ports;
  events: ReturnType<typeof createEventRecorder>;
}> {
  const fs = await loadFixture('ws-transformers');
  for (const e of list) await fileSeed(fs).evidence('softmax', e.id, e);
  const events = createEventRecorder();
  const ports: Ports = {
    repository: createStoreRepository(createStore(fs)),
    clock: new FakeClock('2026-12-01T00:00:00Z'),
    events,
    rules: createRulesRegistry([rulesV1]),
  };
  return { fs, ports, events };
}

describe('recalculate with the store and rules v1', () => {
  it('writes the projection and the derived history', async () => {
    const { fs, ports } = await workspace(STORY);
    const result = await recalculate(ports, 'softmax');
    expect(result.ok && result.value.projection?.state).toBe('mastered');
    expect(await fs.readTextFile(PROJECTION)).toMatchInlineSnapshot(`
      "schema_version: 1
      concept_id: softmax
      state: mastered
      dimensions:
        recall: 0.8256
        understanding: 0.8
        reasoning: null
        application: 0.6585
        transfer: null
      confidence: 0.583
      rules_version: 1
      evidence_ids: [01JD3K8Q8Z6V7X2N4M5P9R0000, 01JD3K8Q8Z6V7X2N4M5P9R0001, 01JD3K8Q8Z6V7X2N4M5P9R0002, 01JD3K8Q8Z6V7X2N4M5P9R0003]
      explanation:
        - code: state.mastered
          params: {}
        - code: met.independent_verifications
          params:
            count: 2
      "
    `);
    expect(await fs.readTextFile(HISTORY)).toMatchInlineSnapshot(`
      "{"schema_version":1,"at":"2026-11-01T09:00:00Z","state":"diagnosed","dimensions":{"recall":0.5,"understanding":null,"reasoning":null,"application":null,"transfer":null},"confidence":0.2126,"rules_version":1,"cause":{"kind":"evidence","evidence_id":"01JD3K8Q8Z6V7X2N4M5P9R0000"}}
      {"schema_version":1,"at":"2026-11-02T09:00:00Z","state":"learning","dimensions":{"recall":0.6348,"understanding":null,"reasoning":null,"application":0.5,"transfer":null},"confidence":0.3586,"rules_version":1,"cause":{"kind":"evidence","evidence_id":"01JD3K8Q8Z6V7X2N4M5P9R0001"}}
      {"schema_version":1,"at":"2026-11-03T09:00:00Z","state":"learning","dimensions":{"recall":0.7772,"understanding":0.8,"reasoning":null,"application":0.6265,"transfer":null},"confidence":0.4709,"rules_version":1,"cause":{"kind":"evidence","evidence_id":"01JD3K8Q8Z6V7X2N4M5P9R0002"}}
      {"schema_version":1,"at":"2026-11-10T09:00:00Z","state":"mastered","dimensions":{"recall":0.8256,"understanding":0.8,"reasoning":null,"application":0.6585,"transfer":null},"confidence":0.583,"rules_version":1,"cause":{"kind":"evidence","evidence_id":"01JD3K8Q8Z6V7X2N4M5P9R0003"}}
      "
    `);
  });

  it('computing again writes nothing (byte-identical, no event)', async () => {
    const { fs, ports, events } = await workspace(STORY);
    await recalculate(ports, 'softmax');
    const before = await allFiles(fs);
    events.events.length = 0;
    expect(await recalculate(ports, 'softmax')).toMatchObject({
      ok: true,
      value: {
        projectionWritten: false,
        historyWritten: false,
        changed: false,
      },
    });
    expect(await allFiles(fs)).toEqual(before);
    expect(events.events).toEqual([]);
  });

  it('two workspaces with the same evidence, written in different orders, give the same bytes (invariant 3)', async () => {
    const a = await workspace(STORY);
    const b = await workspace([...STORY].reverse());
    await recalculate(a.ports, 'softmax');
    await recalculate(b.ports, 'softmax');
    expect(await b.fs.readTextFile(PROJECTION)).toBe(
      await a.fs.readTextFile(PROJECTION),
    );
    expect(await b.fs.readTextFile(HISTORY)).toBe(
      await a.fs.readTextFile(HISTORY),
    );
  });

  it('evidence added one at a time gives the same files as all at once', async () => {
    const all = await workspace(STORY);
    await recalculate(all.ports, 'softmax');
    const step = await workspace();
    for (const e of STORY) {
      await fileSeed(step.fs).evidence('softmax', e.id, e);
      await recalculate(step.ports, 'softmax');
    }
    expect(await step.fs.readTextFile(PROJECTION)).toBe(
      await all.fs.readTextFile(PROJECTION),
    );
    expect(await step.fs.readTextFile(HISTORY)).toBe(
      await all.fs.readTextFile(HISTORY),
    );
  });

  it('late evidence (synced from another device, earlier created_at) rewrites the middle of the history', async () => {
    const { fs, ports } = await workspace(
      [STORY[0], STORY[2], STORY[3]].filter((e) => e !== undefined),
    );
    await recalculate(ports, 'softmax');
    const before = (await fs.readTextFile(HISTORY)).split('\n');
    await fileSeed(fs).evidence('softmax', ulid(1), STORY[1]);
    expect(await recalculate(ports, 'softmax')).toMatchObject({
      ok: true,
      value: { historyWritten: true },
    });
    const after = (await fs.readTextFile(HISTORY)).split('\n');
    expect(after[0]).toBe(before[0]);
    expect(after.some((line) => line.includes(ulid(1)))).toBe(true);
    const fresh = await workspace(STORY);
    await recalculate(fresh.ports, 'softmax');
    expect(await fs.readTextFile(HISTORY)).toBe(
      await fresh.fs.readTextFile(HISTORY),
    );
  });

  it('works with submitEvidence: submit, then recalculate', async () => {
    const { fs, ports } = await workspace();
    for (const e of STORY)
      expect((await submitEvidence(ports, e)).ok).toBe(true);
    await recalculate(ports, 'softmax');
    const reference = await workspace(STORY);
    await recalculate(reference.ports, 'softmax');
    expect(await fs.readTextFile(PROJECTION)).toBe(
      await reference.fs.readTextFile(PROJECTION),
    );
  });

  it('no evidence and no projection: no file is created', async () => {
    const { fs, ports } = await workspace();
    const before = await allFiles(fs);
    expect(await recalculate(ports, 'softmax')).toMatchObject({
      ok: true,
      value: { projection: null },
    });
    expect(await allFiles(fs)).toEqual(before);
  });
});

describe('recalculate with the store: a refusal changes no file (invariant 9)', () => {
  async function refusedWith(
    setup: (fs: MemoryFileSystem) => Promise<void>,
    list = STORY,
  ) {
    const { fs, ports, events } = await workspace(list);
    await recalculate(ports, 'softmax');
    events.events.length = 0;
    await setup(fs);
    const before = await allFiles(fs);
    const result = await recalculate(ports, 'softmax');
    expect(await allFiles(fs)).toEqual(before);
    expect(events.events).toEqual([]);
    return result.ok ? null : result.error.code;
  }

  it('evidence from a newer version, next to a mastered projection', async () => {
    expect(
      await refusedWith((fs) =>
        put(
          fs,
          `evidence/softmax/${ulid(9)}.json`,
          JSON.stringify({ schema_version: 99, id: ulid(9) }),
        ),
      ),
    ).toBe('core.evidence_version_too_new');
  });

  it('a mastered projection stays untouched when the only evidence is too new', async () => {
    const { fs, ports } = await workspace(STORY);
    await recalculate(ports, 'softmax');
    const projection = await fs.readTextFile(PROJECTION);
    expect(projection).toContain('state: mastered');
    const fresh = await loadFixture('ws-transformers');
    await put(fresh, PROJECTION, projection);
    await put(
      fresh,
      `evidence/softmax/${ulid(0)}.json`,
      JSON.stringify({ schema_version: 99 }),
    );
    const before = await allFiles(fresh);
    const result = await recalculate(
      { ...ports, repository: createStoreRepository(createStore(fresh)) },
      'softmax',
    );
    expect(result.ok ? null : result.error.code).toBe(
      'core.evidence_version_too_new',
    );
    expect(await allFiles(fresh)).toEqual(before);
  });

  it('evidence that cannot be read', async () => {
    expect(
      await refusedWith((fs) =>
        put(fs, `evidence/softmax/${ulid(9)}.json`, '{'),
      ),
    ).toBe('core.evidence_unreadable');
  });

  it('a history line from a newer version', async () => {
    expect(
      await refusedWith(async (fs) => {
        await put(fs, HISTORY, `${JSON.stringify({ schema_version: 99 })}\n`);
        await fileSeed(fs).evidence('softmax', ulid(9), evidence(9, 20, FULL));
      }),
    ).toBe('core.mastery_version_too_new');
  });

  it('a projection computed by newer rules', async () => {
    expect(
      await refusedWith(async (fs) => {
        const text = await fs.readTextFile(PROJECTION);
        await put(
          fs,
          PROJECTION,
          text.replace('rules_version: 1', 'rules_version: 2'),
        );
      }),
    ).toBe('core.rules_version_unknown');
  });

  it('a concept without criteria', async () => {
    const { fs, ports } = await workspace();
    await fileSeed(fs).evidence('probability', ulid(0), {
      ...evidence(0, 1, FULL),
      concept_id: 'probability',
    });
    const before = await allFiles(fs);
    const result = await recalculate(ports, 'probability');
    expect(result.ok ? null : result.error.code).toBe(
      'core.criteria_not_found',
    );
    expect(await allFiles(fs)).toEqual(before);
  });
});
