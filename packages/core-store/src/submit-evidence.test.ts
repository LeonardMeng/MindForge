/**
 * 不变量 9：`submitEvidence` 拒绝时，磁盘上的文件一个字节都不变。用真实的 store 和
 * ws-transformers fixture（softmax 的 criteria 是 v1，考察 recall、understanding、application）。
 */
import { CORE_ERROR_CODES, submitEvidence, type Ports } from '@mastery/core';
import {
  createEventRecorder,
  createRulesRegistry,
  stubRules,
} from '@mastery/core/testing';
import { FakeClock, type MemoryFileSystem } from '@mastery/platform-memory';
import { createStore } from '@mastery/store';
import { loadFixture } from '@mastery/testkit';
import { beforeEach, describe, expect, it } from 'vitest';

import { createStoreRepository } from './index.js';
import { allFiles, fileSeed, put } from './test-helpers.js';

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

function session(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    id: SESSION_ID,
    concept_id: 'softmax',
    criteria_version: 1,
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
    ...overrides,
  };
}

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    id: E1,
    concept_id: 'softmax',
    session_id: SESSION_ID,
    assessment_type: 'independent_verification',
    criteria_version: 1,
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

let fs: MemoryFileSystem;
let ports: Ports;
let events: ReturnType<typeof createEventRecorder>;

beforeEach(async () => {
  fs = await loadFixture('ws-transformers');
  await fileSeed(fs).session('softmax', SESSION_ID, session());
  events = createEventRecorder();
  ports = {
    repository: createStoreRepository(createStore(fs)),
    clock: new FakeClock(NOW),
    events,
    rules: createRulesRegistry([stubRules(1)]),
  };
});

/** 提交，断言被拒绝、文件一个字节都没变、没有事件，返回错误码。 */
async function refusedWith(input: unknown): Promise<string> {
  const before = await allFiles(fs);
  // 快照确实包含了 Workspace 的文件（不是空的）。
  expect(before.has('concepts/softmax.md')).toBe(true);
  expect(before.has(`assessments/softmax/sessions/${SESSION_ID}.json`)).toBe(
    true,
  );
  const result = await submitEvidence(ports, input);
  expect(await allFiles(fs)).toEqual(before);
  expect(events.events).toEqual([]);
  if (result.ok) throw new Error('expected the evidence to be refused');
  expect(CORE_ERROR_CODES).toContain(result.error.code);
  return result.error.code;
}

describe('submitEvidence with the store: a refusal changes no file (invariant 9)', () => {
  it('evidence that does not match the schema', async () => {
    expect(await refusedWith(evidence({ dimensions: NULL_SCORES }))).toBe(
      'core.evidence_invalid',
    );
  });

  it('evidence from more than 5 minutes in the future', async () => {
    expect(
      await refusedWith(evidence({ created_at: '2026-11-20T08:05:01Z' })),
    ).toBe('core.evidence_in_future');
  });

  it('a concept that does not exist', async () => {
    expect(
      await refusedWith(evidence({ ...MANUAL, concept_id: 'no-such-concept' })),
    ).toBe('core.concept_not_found');
  });

  it('a concept file that cannot be read', async () => {
    await put(fs, 'concepts/softmax.md', '---\nid: softmax\n');
    expect(await refusedWith(evidence())).toBe('core.concept_unreadable');
  });

  it('an archived concept', async () => {
    const text = await fs.readTextFile('concepts/softmax.md');
    await put(
      fs,
      'concepts/softmax.md',
      text.replace('status: active', 'status: archived'),
    );
    expect(await refusedWith(evidence())).toBe('core.concept_archived');
  });

  it('a concept without criteria', async () => {
    expect(
      await refusedWith(evidence({ ...MANUAL, concept_id: 'probability' })),
    ).toBe('core.criteria_not_found');
  });

  it('criteria that cannot be read', async () => {
    await put(fs, 'assessments/softmax/criteria.yaml', 'version: [\n');
    expect(await refusedWith(evidence())).toBe('core.criteria_unreadable');
  });

  it('a different criteria version', async () => {
    expect(
      await refusedWith(evidence({ ...MANUAL, criteria_version: 2 })),
    ).toBe('core.criteria_version_mismatch');
  });

  it('a score for a dimension the criteria do not assess', async () => {
    expect(
      await refusedWith(
        evidence({
          ...MANUAL,
          dimensions: { ...NULL_SCORES, recall: 0.9, reasoning: 0.5 },
        }),
      ),
    ).toBe('core.dimension_not_assessed');
  });

  it('a session that does not exist', async () => {
    expect(await refusedWith(evidence({ session_id: OTHER_SESSION_ID }))).toBe(
      'core.session_not_found',
    );
  });

  it('a session stored under another concept is not found', async () => {
    await fileSeed(fs).session(
      'self-attention',
      OTHER_SESSION_ID,
      session({ id: OTHER_SESSION_ID, concept_id: 'self-attention' }),
    );
    expect(await refusedWith(evidence({ session_id: OTHER_SESSION_ID }))).toBe(
      'core.session_not_found',
    );
  });

  it('a session file that cannot be read', async () => {
    await put(fs, `assessments/softmax/sessions/${SESSION_ID}.json`, '{');
    expect(await refusedWith(evidence())).toBe('core.session_unreadable');
  });

  it('a session file of another concept inside this concept is unreadable', async () => {
    await fileSeed(fs).session(
      'softmax',
      SESSION_ID,
      session({ concept_id: 'self-attention' }),
    );
    expect(await refusedWith(evidence())).toBe('core.session_unreadable');
  });

  it('a session with a different criteria version', async () => {
    await fileSeed(fs).session(
      'softmax',
      SESSION_ID,
      session({ criteria_version: 2 }),
    );
    expect(await refusedWith(evidence())).toBe('core.session_mismatch');
  });

  it('a score for a dimension the session did not score', async () => {
    expect(
      await refusedWith(
        evidence({
          dimensions: { ...NULL_SCORES, recall: 0.9, application: 0.6 },
        }),
      ),
    ).toBe('core.session_mismatch');
  });

  it('evidence created before the session was completed', async () => {
    expect(
      await refusedWith(evidence({ created_at: '2026-11-19T09:59:59Z' })),
    ).toBe('core.evidence_before_session');
  });

  it('a second piece of evidence for the same session', async () => {
    expect((await submitEvidence(ports, evidence())).ok).toBe(true);
    events.events.length = 0;
    expect(await refusedWith(evidence({ id: E2 }))).toBe(
      'core.session_already_used',
    );
  });

  it('an evidence id that already exists', async () => {
    expect((await submitEvidence(ports, evidence(MANUAL))).ok).toBe(true);
    events.events.length = 0;
    expect(await refusedWith(evidence({ ...MANUAL, note: '又讲了一遍' }))).toBe(
      'core.evidence_already_exists',
    );
  });
});

describe('submitEvidence with the store: accepted evidence', () => {
  it('adds exactly one file, the evidence, and emits evidence/submitted', async () => {
    const before = await allFiles(fs);
    const result = await submitEvidence(ports, evidence());
    expect(result.ok).toBe(true);
    const after = await allFiles(fs);
    const added = [...after.keys()].filter((path) => !before.has(path));
    expect(added).toEqual([`evidence/softmax/${E1}.json`]);
    for (const [path, text] of before) expect(after.get(path)).toBe(text);
    expect(JSON.parse(after.get(`evidence/softmax/${E1}.json`) ?? '')).toEqual(
      evidence(),
    );
    expect(events.events).toEqual([
      {
        type: 'evidence/submitted',
        conceptId: 'softmax',
        evidenceId: E1,
        at: NOW,
      },
    ]);
  });

  it('accepts created_at exactly 5 minutes in the future', async () => {
    const result = await submitEvidence(
      ports,
      evidence({ created_at: '2026-11-20T08:05:00Z' }),
    );
    expect(result.ok).toBe(true);
  });
});
