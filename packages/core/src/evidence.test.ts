import type { Clock } from '@mastery/platform';
import type { IsoDateTime } from '@mastery/schema';
import { describe, expect, it } from 'vitest';

import {
  EVIDENCE_CLOCK_TOLERANCE_MS,
  EVIDENCE_INPUT_FILE,
  submitEvidence,
  type Ports,
  type Repository,
} from './index.js';
import {
  createEventRecorder,
  createMemoryRepository,
  createRulesRegistry,
  stubRules,
  type RepositorySeed,
} from './testing/index.js';

const NOW = '2026-11-20T08:00:00Z';
const SESSION_ID = '01JD3K7A2B3C4D5E6F7G8H9J0K';
const OTHER_SESSION_ID = '01JD3K7A2B3C4D5E6F7G8H9J0M';
const E1 = '01JD3K8Q8Z6V7X2N4M5P9R0T1A';
const E2 = '01JD3K8Q8Z6V7X2N4M5P9R0T1B';

const NULL_SCORES = {
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
  version: 2,
  dimensions: {
    ...NULL_SCORES,
    recall: { focus: ['写出 softmax 的公式'], threshold: 0.8 },
    application: { focus: ['手算三个数的 softmax'], threshold: 0.6 },
  },
};

const SESSION = {
  schema_version: 1,
  id: SESSION_ID,
  concept_id: 'softmax',
  criteria_version: 2,
  started_at: '2026-11-19T09:40:00Z',
  completed_at: '2026-11-19T10:00:00Z',
  items: [
    {
      dimensions: ['recall'],
      question: '写出 softmax 的公式。',
      answer: 'exp(x_i) / Σ exp(x_j)',
      rationale: '正确。',
      scores: { ...NULL_SCORES, recall: 0.9 },
    },
  ],
};

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    id: E1,
    concept_id: 'softmax',
    session_id: SESSION_ID,
    assessment_type: 'independent_verification',
    criteria_version: 2,
    dimensions: { ...NULL_SCORES, recall: 0.9 },
    confidence: 0.8,
    evaluator: {
      kind: 'agent',
      id: 'agent-evaluator',
      model: 'ollama:qwen3-14b',
    },
    note: null,
    created_at: '2026-11-19T10:00:00Z',
    ...overrides,
  };
}

const MANUAL = {
  session_id: null,
  assessment_type: 'self_assessment',
  evaluator: { kind: 'human' },
  note: '口头讲解了一遍',
};

/** 2026-11-20T08:00:00Z 之后 `ms` 毫秒（ms 是整秒）。 */
const after = (ms: number) =>
  new Date(Date.parse(NOW) + ms).toISOString().replace('.000Z', 'Z');

interface Setup {
  readonly ports: Ports;
  readonly repository: Repository;
  readonly seed: RepositorySeed;
  readonly events: ReturnType<typeof createEventRecorder>;
}

async function setup(
  options: {
    readonly concept?: unknown;
    readonly criteria?: unknown;
    readonly session?: unknown;
    readonly wrap?: (repository: Repository) => Repository;
    readonly onEmit?: () => void;
  } = {},
): Promise<Setup> {
  const memory = createMemoryRepository();
  const { seed } = memory;
  if (options.concept !== null)
    await seed.concept('softmax', options.concept ?? CONCEPT);
  if (options.criteria !== null)
    await seed.criteria('softmax', options.criteria ?? CRITERIA);
  if (options.session !== null) {
    await seed.session('softmax', SESSION_ID, options.session ?? SESSION);
  }
  const repository = options.wrap?.(memory.repository) ?? memory.repository;
  const clock: Clock = { now: () => NOW as IsoDateTime };
  const events = createEventRecorder(options.onEmit);
  const ports: Ports = {
    repository,
    clock,
    events,
    rules: createRulesRegistry([stubRules(1)]),
  };
  return { ports, repository: memory.repository, seed, events };
}

/** 提交，断言被拒绝且什么都没写、没有事件。 */
async function rejected(s: Setup, input: unknown) {
  const before = await s.repository.listEvidence('softmax');
  const result = await submitEvidence(s.ports, input);
  expect(result.ok).toBe(false);
  expect(await s.repository.listEvidence('softmax')).toEqual(before);
  expect(s.events.events).toEqual([]);
  if (result.ok) throw new Error('unreachable');
  return result.error;
}

describe('submitEvidence: accepted evidence', () => {
  it('appends the evidence, returns it and emits evidence/submitted', async () => {
    const s = await setup();
    const result = await submitEvidence(s.ports, evidence());
    expect(result).toEqual({ ok: true, value: evidence() });
    expect((await s.repository.listEvidence('softmax')).items).toEqual([
      evidence(),
    ]);
    expect(s.events.events).toEqual([
      {
        type: 'evidence/submitted',
        conceptId: 'softmax',
        evidenceId: E1,
        at: NOW,
      },
    ]);
  });

  it('accepts manual evidence without a session', async () => {
    const s = await setup({ session: null });
    const result = await submitEvidence(s.ports, evidence(MANUAL));
    expect(result.ok).toBe(true);
  });

  it('accepts evidence for a draft concept', async () => {
    const s = await setup({ concept: { ...CONCEPT, status: 'draft' } });
    expect((await submitEvidence(s.ports, evidence())).ok).toBe(true);
  });

  it('does not compute or write mastery', async () => {
    const s = await setup();
    await submitEvidence(s.ports, evidence());
    expect(await s.repository.getMastery('softmax')).toEqual({
      kind: 'missing',
    });
    expect(await s.repository.getHistory('softmax')).toEqual({
      kind: 'missing',
    });
  });

  it('a listener error does not change the result', async () => {
    const s = await setup({
      onEmit: () => {
        throw new Error('listener broke');
      },
    });
    const result = await submitEvidence(s.ports, evidence());
    expect(result.ok).toBe(true);
    expect(s.events.errors).toHaveLength(1);
    expect((await s.repository.listEvidence('softmax')).items).toHaveLength(1);
  });
});

describe('submitEvidence: the evidence itself', () => {
  it('refuses input that does not match the schema', async () => {
    const s = await setup();
    const error = await rejected(s, evidence({ confidence: 7 }));
    expect(error.code).toBe('core.evidence_invalid');
    expect(error.issues.length).toBeGreaterThan(0);
    expect(
      error.issues.every((issue) => issue.file === EVIDENCE_INPUT_FILE),
    ).toBe(true);
  });

  it('refuses input that is not an object', async () => {
    const s = await setup();
    expect((await rejected(s, 'evidence')).code).toBe('core.evidence_invalid');
  });

  it('the clock tolerance is 5 minutes', () => {
    expect(EVIDENCE_CLOCK_TOLERANCE_MS).toBe(300_000);
  });

  it('accepts created_at exactly at the tolerance', async () => {
    const s = await setup();
    const result = await submitEvidence(
      s.ports,
      evidence({ created_at: after(EVIDENCE_CLOCK_TOLERANCE_MS) }),
    );
    expect(result.ok).toBe(true);
  });

  it('refuses created_at one second past the tolerance', async () => {
    const s = await setup();
    const error = await rejected(
      s,
      evidence({ created_at: after(EVIDENCE_CLOCK_TOLERANCE_MS + 1000) }),
    );
    expect(error.code).toBe('core.evidence_in_future');
  });

  it('refuses an id that already exists', async () => {
    const s = await setup({ session: null });
    await s.seed.evidence(
      'softmax',
      E1,
      evidence({ ...MANUAL, note: '第一次' }),
    );
    const error = await rejected(s, evidence(MANUAL));
    expect(error.code).toBe('core.evidence_already_exists');
    expect(error.params).toEqual({ evidence_id: E1 });
  });

  it('reports an append the repository refuses as invalid', async () => {
    const s = await setup({
      wrap: (repository) => ({
        ...repository,
        appendEvidence: () =>
          Promise.resolve({
            ok: false,
            reason: 'invalid',
            issues: [
              {
                file: 'evidence/softmax/x.json',
                code: 'x',
                path: [],
                message: 'x',
              },
            ],
          }),
      }),
    });
    const error = await rejected(s, evidence());
    expect(error.code).toBe('core.evidence_invalid');
    expect(error.issues).toHaveLength(1);
  });
});

describe('submitEvidence: concept and criteria', () => {
  it('refuses a concept that does not exist', async () => {
    const s = await setup({ concept: null });
    expect((await rejected(s, evidence())).code).toBe('core.concept_not_found');
  });

  it('refuses a concept that cannot be read', async () => {
    const s = await setup({ concept: { ...CONCEPT, name: '' } });
    const error = await rejected(s, evidence());
    expect(error.code).toBe('core.concept_unreadable');
    expect(error.issues.length).toBeGreaterThan(0);
  });

  it('refuses an archived concept', async () => {
    const s = await setup({ concept: { ...CONCEPT, status: 'archived' } });
    expect((await rejected(s, evidence())).code).toBe('core.concept_archived');
  });

  it('refuses when there are no criteria', async () => {
    const s = await setup({ criteria: null });
    expect((await rejected(s, evidence())).code).toBe(
      'core.criteria_not_found',
    );
  });

  it('refuses when the criteria cannot be read', async () => {
    const s = await setup({ criteria: { ...CRITERIA, version: 0 } });
    expect((await rejected(s, evidence())).code).toBe(
      'core.criteria_unreadable',
    );
  });

  it('refuses a different criteria version', async () => {
    const s = await setup({ session: null });
    const error = await rejected(
      s,
      evidence({ ...MANUAL, criteria_version: 1 }),
    );
    expect(error.code).toBe('core.criteria_version_mismatch');
    expect(error.params).toEqual({
      concept_id: 'softmax',
      expected: 2,
      actual: 1,
    });
  });

  it('refuses a score for a dimension the criteria do not assess', async () => {
    const s = await setup({ session: null });
    const error = await rejected(
      s,
      evidence({
        ...MANUAL,
        dimensions: { ...NULL_SCORES, recall: 0.9, transfer: 0.5 },
      }),
    );
    expect(error.code).toBe('core.dimension_not_assessed');
    expect(error.params).toEqual({
      concept_id: 'softmax',
      dimension: 'transfer',
    });
  });
});

describe('submitEvidence: the session', () => {
  it('refuses a session that does not exist', async () => {
    const s = await setup({ session: null });
    const error = await rejected(s, evidence());
    expect(error.code).toBe('core.session_not_found');
    expect(error.params).toEqual({ session_id: SESSION_ID });
  });

  it('refuses a session that cannot be read', async () => {
    const s = await setup({ session: { ...SESSION, items: [] } });
    expect((await rejected(s, evidence())).code).toBe(
      'core.session_unreadable',
    );
  });

  it('refuses a session of another concept (stub repository)', async () => {
    const s = await setup({
      wrap: (repository) => ({
        ...repository,
        getSession: async (conceptId, sessionId) => {
          const read = await repository.getSession(conceptId, sessionId);
          return read.kind === 'found'
            ? {
                kind: 'found',
                value: { ...read.value, concept_id: 'probability' as never },
              }
            : read;
        },
      }),
    });
    const error = await rejected(s, evidence());
    expect(error.code).toBe('core.session_mismatch');
    expect(error.params).toMatchObject({
      field: 'concept_id',
      expected: 'probability',
      actual: 'softmax',
    });
  });

  it('refuses a session with a different criteria version', async () => {
    const s = await setup({ session: { ...SESSION, criteria_version: 1 } });
    const error = await rejected(s, evidence());
    expect(error.code).toBe('core.session_mismatch');
    expect(error.params).toMatchObject({
      field: 'criteria_version',
      expected: '1',
      actual: '2',
    });
  });

  it('refuses a score for a dimension the session did not score', async () => {
    const s = await setup();
    const error = await rejected(
      s,
      evidence({
        dimensions: { ...NULL_SCORES, recall: 0.9, application: 0.7 },
      }),
    );
    expect(error.code).toBe('core.session_mismatch');
    expect(error.params).toMatchObject({
      field: 'dimensions',
      expected: 'recall',
      actual: 'recall,application',
    });
  });

  it('accepts evidence created exactly when the session was completed', async () => {
    const s = await setup();
    const result = await submitEvidence(
      s.ports,
      evidence({ created_at: SESSION.completed_at }),
    );
    expect(result.ok).toBe(true);
  });

  it('refuses evidence created before the session was completed', async () => {
    const s = await setup();
    const error = await rejected(
      s,
      evidence({ created_at: '2026-11-19T09:59:59Z' }),
    );
    expect(error.code).toBe('core.evidence_before_session');
  });

  it('refuses a second piece of evidence for the same session', async () => {
    const s = await setup();
    await s.seed.evidence('softmax', E1, evidence());
    const error = await rejected(s, evidence({ id: E2 }));
    expect(error.code).toBe('core.session_already_used');
    expect(error.params).toEqual({ session_id: SESSION_ID, evidence_id: E1 });
  });

  it('evidence for another session does not count as using this one', async () => {
    const s = await setup();
    await s.seed.session('softmax', OTHER_SESSION_ID, {
      ...SESSION,
      id: OTHER_SESSION_ID,
    });
    await s.seed.evidence(
      'softmax',
      E1,
      evidence({ session_id: OTHER_SESSION_ID }),
    );
    const result = await submitEvidence(s.ports, evidence({ id: E2 }));
    expect(result.ok).toBe(true);
  });
});
