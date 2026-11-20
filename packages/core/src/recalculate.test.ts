import type { Evidence, MasteryState } from '@mastery/schema';
import { describe, expect, it } from 'vitest';

import {
  deriveHistory,
  recalculate,
  type Aggregate,
  type Evaluation,
  type Ports,
  type Rules,
} from './index.js';
import {
  createEventRecorder,
  createMemoryRepository,
  createRulesRegistry,
  type MemoryRepository,
} from './testing/index.js';

const NULLS = {
  recall: null,
  understanding: null,
  reasoning: null,
  application: null,
  transfer: null,
};

const CONCEPT = {
  schema_version: 1,
  id: 'softmax',
  name: 'Softmax',
  prerequisites: [],
  status: 'active',
};

const CRITERIA = {
  schema_version: 1,
  concept_id: 'softmax',
  version: 1,
  dimensions: { ...NULLS, recall: { focus: ['公式'], threshold: 0.8 } },
};

const ulid = (n: number) =>
  `01JD3K8Q8Z6V7X2N4M5P9R${String(n).padStart(4, '0')}`;

function evidence(n: number, recall: number, day = n) {
  return {
    schema_version: 1,
    id: ulid(n),
    concept_id: 'softmax',
    session_id: null,
    assessment_type: 'self_assessment',
    criteria_version: 1,
    dimensions: { ...NULLS, recall },
    confidence: 1,
    evaluator: { kind: 'human' },
    note: 'test',
    created_at: `2026-11-${String(day + 1).padStart(2, '0')}T00:00:00Z`,
  };
}

/**
 * 测试用的规则：按 `(created_at, id)` 处理证据，第一条是 diagnosed，之后是 learning；
 * recall 是最后一条证据的分数（向下取到 0.1），置信度固定 0.5。
 */
function fakeRules(version: number): Rules {
  const aggregateOf = (list: readonly Evidence[]): Aggregate => {
    const last = list[list.length - 1];
    const recall =
      last === undefined
        ? null
        : Math.floor((last.dimensions.recall ?? 0) * 10) / 10;
    return {
      dimensions: { ...NULLS, recall },
      confidence: last === undefined ? 0 : 0.5,
      perDimension: { ...NULLS },
    };
  };
  return {
    version,
    aggregate: aggregateOf,
    evaluate: (list: readonly Evidence[]): Evaluation => {
      const sorted = [...list].sort((a, b) =>
        a.created_at === b.created_at
          ? a.id < b.id
            ? -1
            : 1
          : a.created_at < b.created_at
            ? -1
            : 1,
      );
      let state: MasteryState = 'not_assessed';
      const steps = sorted.map((e, i) => {
        const to: MasteryState = i === 0 ? 'diagnosed' : 'learning';
        const step = {
          from: state,
          to,
          evidenceId: e.id,
          at: e.created_at,
          ...(({ dimensions, confidence }) => ({ dimensions, confidence }))(
            aggregateOf(sorted.slice(0, i + 1)),
          ),
        };
        state = to;
        return step;
      });
      return {
        state,
        aggregate: aggregateOf(sorted),
        explanation: [{ code: `state.${state}`, params: {} }],
        steps,
      };
    },
  };
}

interface Setup {
  readonly memory: MemoryRepository;
  readonly ports: Ports;
  readonly events: ReturnType<typeof createEventRecorder>;
}

async function setup(
  options: {
    concept?: unknown;
    criteria?: unknown;
    rules?: Rules[];
    onEmit?: () => void;
  } = {},
): Promise<Setup> {
  const memory = createMemoryRepository();
  if (options.concept !== null)
    await memory.seed.concept('softmax', options.concept ?? CONCEPT);
  if (options.criteria !== null) {
    await memory.seed.criteria('softmax', options.criteria ?? CRITERIA);
  }
  const events = createEventRecorder(options.onEmit);
  const ports: Ports = {
    repository: memory.repository,
    clock: { now: () => '2026-12-01T00:00:00Z' as never },
    events,
    rules: createRulesRegistry(options.rules ?? [fakeRules(1)]),
  };
  return { memory, ports, events };
}

const snapshot = async ({ memory }: Setup) => ({
  mastery: await memory.repository.getMastery('softmax'),
  history: await memory.repository.getHistory('softmax'),
});

async function refused(s: Setup): Promise<string> {
  const before = await snapshot(s);
  const result = await recalculate(s.ports, 'softmax');
  expect(await snapshot(s)).toEqual(before);
  expect(s.events.events).toEqual([]);
  if (result.ok) throw new Error('expected a refusal');
  return result.error.code;
}

const PROJECTION = {
  schema_version: 1,
  concept_id: 'softmax',
  state: 'mastered',
  dimensions: { ...NULLS, recall: 0.9 },
  confidence: 0.8,
  rules_version: 1,
  evidence_ids: [ulid(0)],
  explanation: [{ code: 'state.mastered', params: {} }],
};
const TOO_NEW = { schema_version: 99 };

describe('recalculate: refusals write nothing', () => {
  it('a concept that does not exist', async () => {
    expect(await refused(await setup({ concept: null }))).toBe(
      'core.concept_not_found',
    );
  });

  it('a concept that cannot be read', async () => {
    expect(
      await refused(await setup({ concept: { ...CONCEPT, name: '' } })),
    ).toBe('core.concept_unreadable');
  });

  it('no criteria', async () => {
    expect(await refused(await setup({ criteria: null }))).toBe(
      'core.criteria_not_found',
    );
  });

  it('criteria that cannot be read', async () => {
    expect(
      await refused(await setup({ criteria: { ...CRITERIA, version: 0 } })),
    ).toBe('core.criteria_unreadable');
  });

  it('evidence from a newer version', async () => {
    const s = await setup();
    await s.memory.seed.evidence('softmax', ulid(0), evidence(0, 0.5));
    await s.memory.seed.evidence('softmax', ulid(1), {
      ...TOO_NEW,
      id: ulid(1),
    });
    const before = await s.memory.repository.listEvidence('softmax');
    expect(await refused(s)).toBe('core.evidence_version_too_new');
    expect(await s.memory.repository.listEvidence('softmax')).toEqual(before);
  });

  it('a mastered projection stays untouched when the only evidence is too new', async () => {
    const s = await setup();
    await s.memory.seed.mastery('softmax', PROJECTION);
    await s.memory.seed.evidence('softmax', ulid(0), {
      ...TOO_NEW,
      id: ulid(0),
    });
    const result = await recalculate(s.ports, 'softmax');
    expect(result.ok ? null : result.error.code).toBe(
      'core.evidence_version_too_new',
    );
    expect(result.ok ? null : result.error.params).toEqual({
      concept_id: 'softmax',
      count: 1,
    });
    expect(await s.memory.repository.getMastery('softmax')).toEqual({
      kind: 'found',
      value: PROJECTION,
    });
    expect(s.events.events).toEqual([]);
  });

  it('evidence that cannot be read', async () => {
    const s = await setup();
    await s.memory.seed.mastery('softmax', PROJECTION);
    await s.memory.seed.evidence('softmax', ulid(0), {
      ...evidence(0, 0.5),
      confidence: 7,
    });
    expect(await refused(s)).toBe('core.evidence_unreadable');
  });

  it('a projection computed by newer rules (no downgrade)', async () => {
    const s = await setup();
    await s.memory.seed.mastery('softmax', { ...PROJECTION, rules_version: 2 });
    await s.memory.seed.evidence('softmax', ulid(0), evidence(0, 0.5));
    expect(await refused(s)).toBe('core.rules_version_unknown');
  });

  it('a projection file written by a newer version', async () => {
    const s = await setup();
    await s.memory.seed.mastery('softmax', {
      ...TOO_NEW,
      concept_id: 'softmax',
    });
    await s.memory.seed.evidence('softmax', ulid(0), evidence(0, 0.5));
    expect(await refused(s)).toBe('core.mastery_version_too_new');
  });

  it('a history file with a line from a newer version', async () => {
    const s = await setup();
    await s.memory.seed.history('softmax', [TOO_NEW]);
    await s.memory.seed.evidence('softmax', ulid(0), evidence(0, 0.5));
    expect(await refused(s)).toBe('core.mastery_version_too_new');
  });
});

describe('recalculate: no evidence', () => {
  it('no evidence files and no projection: writes nothing', async () => {
    const s = await setup();
    expect(await recalculate(s.ports, 'softmax')).toEqual({
      ok: true,
      value: {
        projection: null,
        projectionWritten: false,
        changed: false,
        historyWritten: false,
      },
    });
    expect(await snapshot(s)).toEqual({
      mastery: { kind: 'missing' },
      history: { kind: 'missing' },
    });
    expect(s.events.events).toEqual([]);
  });

  it('no evidence files but a projection exists: writes not_assessed', async () => {
    const s = await setup();
    await s.memory.seed.mastery('softmax', PROJECTION);
    const result = await recalculate(s.ports, 'softmax');
    expect(result.ok && result.value.projection?.state).toBe('not_assessed');
    expect(await s.memory.repository.getMastery('softmax')).toMatchObject({
      kind: 'found',
      value: { state: 'not_assessed', evidence_ids: [], rules_version: 1 },
    });
    expect(s.events.events).toEqual([
      {
        type: 'mastery/changed',
        conceptId: 'softmax',
        from: 'mastered',
        to: 'not_assessed',
        rulesVersion: 1,
        cause: { kind: 'rules' },
      },
    ]);
  });
});

describe('recalculate: writes only on change', () => {
  it('first recalculation writes the projection and the derived history and emits mastery/changed', async () => {
    const s = await setup();
    await s.memory.seed.evidence('softmax', ulid(1), evidence(1, 0.6));
    await s.memory.seed.evidence('softmax', ulid(0), evidence(0, 0.5));
    const result = await recalculate(s.ports, 'softmax');
    expect(result).toMatchObject({
      ok: true,
      value: { projectionWritten: true, changed: true, historyWritten: true },
    });
    expect(await s.memory.repository.getMastery('softmax')).toEqual({
      kind: 'found',
      value: {
        schema_version: 1,
        concept_id: 'softmax',
        state: 'learning',
        dimensions: { ...NULLS, recall: 0.6 },
        confidence: 0.5,
        rules_version: 1,
        evidence_ids: [ulid(0), ulid(1)],
        explanation: [{ code: 'state.learning', params: {} }],
      },
    });
    const history = await s.memory.repository.getHistory('softmax');
    expect(
      history.kind === 'found'
        ? history.value.map((e) => [e.at, e.state, e.cause])
        : null,
    ).toEqual([
      [
        '2026-11-01T00:00:00Z',
        'diagnosed',
        { kind: 'evidence', evidence_id: ulid(0) },
      ],
      [
        '2026-11-02T00:00:00Z',
        'learning',
        { kind: 'evidence', evidence_id: ulid(1) },
      ],
    ]);
    expect(s.events.events).toEqual([
      {
        type: 'mastery/changed',
        conceptId: 'softmax',
        from: null,
        to: 'learning',
        rulesVersion: 1,
        cause: { kind: 'evidence', evidence_id: ulid(1) },
      },
    ]);
  });

  it('a second recalculation with nothing new writes nothing and emits nothing', async () => {
    const s = await setup();
    await s.memory.seed.evidence('softmax', ulid(0), evidence(0, 0.5));
    await recalculate(s.ports, 'softmax');
    s.events.events.length = 0;
    expect(await recalculate(s.ports, 'softmax')).toMatchObject({
      ok: true,
      value: {
        projectionWritten: false,
        changed: false,
        historyWritten: false,
      },
    });
    expect(s.events.events).toEqual([]);
  });

  it('new evidence changes the projection, extends the history and emits mastery/changed', async () => {
    const s = await setup();
    await s.memory.seed.evidence('softmax', ulid(0), evidence(0, 0.5));
    await recalculate(s.ports, 'softmax');
    s.events.events.length = 0;
    await s.memory.seed.evidence('softmax', ulid(1), evidence(1, 0.7));
    expect(await recalculate(s.ports, 'softmax')).toMatchObject({
      ok: true,
      value: { projectionWritten: true, changed: true, historyWritten: true },
    });
    expect(s.events.events).toMatchObject([
      { from: 'diagnosed', to: 'learning' },
    ]);
  });

  it('late evidence (an earlier created_at) rewrites the middle of the history', async () => {
    const s = await setup();
    await s.memory.seed.evidence('softmax', ulid(0), evidence(0, 0.5, 0));
    await s.memory.seed.evidence('softmax', ulid(1), evidence(1, 0.9, 5));
    await recalculate(s.ports, 'softmax');
    await s.memory.seed.evidence('softmax', ulid(2), evidence(2, 0.3, 2));
    const result = await recalculate(s.ports, 'softmax');
    expect(result).toMatchObject({ ok: true, value: { historyWritten: true } });
    const history = await s.memory.repository.getHistory('softmax');
    expect(
      history.kind === 'found' ? history.value.map((e) => e.at) : null,
    ).toEqual([
      '2026-11-01T00:00:00Z',
      '2026-11-03T00:00:00Z',
      '2026-11-06T00:00:00Z',
    ]);
  });

  it('repairs a stale history without emitting an event (crash between the two writes)', async () => {
    const s = await setup();
    await s.memory.seed.evidence('softmax', ulid(0), evidence(0, 0.5));
    await recalculate(s.ports, 'softmax');
    s.events.events.length = 0;
    await s.memory.repository.writeHistory('softmax', []);
    expect(await recalculate(s.ports, 'softmax')).toMatchObject({
      ok: true,
      value: { projectionWritten: false, changed: false, historyWritten: true },
    });
    expect(s.events.events).toEqual([]);
  });

  it('overwrites a broken projection (derived data); from is null', async () => {
    const s = await setup();
    await s.memory.seed.mastery('softmax', { ...PROJECTION, confidence: 5 });
    await s.memory.seed.evidence('softmax', ulid(0), evidence(0, 0.5));
    expect(await recalculate(s.ports, 'softmax')).toMatchObject({
      ok: true,
      value: { projectionWritten: true, changed: true },
    });
    expect(s.events.events).toMatchObject([{ from: null, to: 'diagnosed' }]);
  });

  it('a projection from older rules is recomputed with the current rules; cause is rules', async () => {
    const s = await setup({ rules: [fakeRules(1), fakeRules(2)] });
    await s.memory.seed.evidence('softmax', ulid(0), evidence(0, 0.5));
    await s.memory.seed.mastery('softmax', {
      ...PROJECTION,
      state: 'diagnosed',
      dimensions: { ...NULLS, recall: 0.5 },
      confidence: 0.5,
      explanation: [{ code: 'state.diagnosed', params: {} }],
    });
    const result = await recalculate(s.ports, 'softmax');
    expect(result.ok && result.value.projection?.rules_version).toBe(2);
    expect(s.events.events).toMatchObject([
      { from: 'diagnosed', to: 'diagnosed', cause: { kind: 'rules' } },
    ]);
  });

  it('recalculates an archived concept', async () => {
    const s = await setup({ concept: { ...CONCEPT, status: 'archived' } });
    await s.memory.seed.evidence('softmax', ulid(0), evidence(0, 0.5));
    expect((await recalculate(s.ports, 'softmax')).ok).toBe(true);
  });

  it('a listener error does not change the result', async () => {
    const s = await setup({
      onEmit: () => {
        throw new Error('listener broke');
      },
    });
    await s.memory.seed.evidence('softmax', ulid(0), evidence(0, 0.5));
    expect((await recalculate(s.ports, 'softmax')).ok).toBe(true);
    expect(s.events.errors).toHaveLength(1);
  });
});

describe('deriveHistory', () => {
  const step = (n: number, to: MasteryState, recall: number) => ({
    from: 'not_assessed' as MasteryState,
    to,
    evidenceId: ulid(n) as never,
    at: `2026-11-0${n + 1}T00:00:00Z` as never,
    dimensions: { ...NULLS, recall },
    confidence: 0.5,
  });
  const evaluation = (steps: ReturnType<typeof step>[]): Evaluation => ({
    state: steps[steps.length - 1]?.to ?? 'not_assessed',
    aggregate: { dimensions: NULLS, confidence: 0, perDimension: NULLS },
    explanation: [],
    steps,
  });

  it('has one entry for the first step and one per change, none for unchanged steps', () => {
    const history = deriveHistory(
      evaluation([
        step(0, 'diagnosed', 0.5),
        step(1, 'diagnosed', 0.5),
        step(2, 'learning', 0.5),
        step(3, 'learning', 0.6),
      ]),
      3,
    );
    expect(
      history.map((e) => [
        e.cause,
        e.state,
        e.dimensions.recall,
        e.rules_version,
      ]),
    ).toEqual([
      [{ kind: 'evidence', evidence_id: ulid(0) }, 'diagnosed', 0.5, 3],
      [{ kind: 'evidence', evidence_id: ulid(2) }, 'learning', 0.5, 3],
      [{ kind: 'evidence', evidence_id: ulid(3) }, 'learning', 0.6, 3],
    ]);
  });

  it('is empty without steps', () => {
    expect(deriveHistory(evaluation([]), 1)).toEqual([]);
  });
});
