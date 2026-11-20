/**
 * Repository 的契约测试。所有实现都要通过同一套测试：`@mastery/core/testing` 的内存实现、
 * `@mastery/core-store` 的 `createStoreRepository`（2.2）。这样测试用的假实现不会和真实的实现走样。
 *
 * ```ts
 * import { describeRepositoryContract } from '@mastery/core/contract';
 * describeRepositoryContract('store', () => ({ repository, seed }));
 * ```
 *
 * 依赖 vitest（可选的 peerDependency），只在测试里使用。
 */
import type {
  Evidence,
  MasteryHistoryEntry,
  MasteryProjection,
} from '@mastery/schema';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Repository } from '../repository.js';
import type { RepositorySeed } from '../testing/index.js';

export type { RepositorySeed } from '../testing/index.js';

/** 契约测试的被测对象：一个空的 Workspace 上的 Repository。 */
export interface RepositoryContractSubject {
  readonly repository: Repository;
  readonly seed: RepositorySeed;
}

const CONCEPT = {
  schema_version: 1,
  id: 'softmax',
  name: 'Softmax',
  prerequisites: ['probability'],
  status: 'active',
};

const CRITERIA = {
  schema_version: 1,
  concept_id: 'softmax',
  version: 2,
  dimensions: {
    recall: { focus: ['写出 softmax 的公式'], threshold: 0.8 },
    understanding: null,
    reasoning: null,
    application: null,
    transfer: null,
  },
};

const SESSION_ID = '01JD3K7A2B3C4D5E6F7G8H9J0K';
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
      scores: {
        recall: 0.9,
        understanding: null,
        reasoning: null,
        application: null,
        transfer: null,
      },
    },
  ],
};

/** 一条合法的证据，id 可以换。 */
function evidence(
  id: string,
  overrides: Record<string, unknown> = {},
): Evidence {
  return {
    schema_version: 1,
    id,
    concept_id: 'softmax',
    session_id: SESSION_ID,
    assessment_type: 'independent_verification',
    criteria_version: 2,
    dimensions: {
      recall: 0.9,
      understanding: null,
      reasoning: null,
      application: null,
      transfer: null,
    },
    confidence: 0.8,
    evaluator: {
      kind: 'agent',
      id: 'agent-evaluator',
      model: 'ollama:qwen3-14b',
    },
    note: null,
    created_at: '2026-11-19T10:00:00Z',
    ...overrides,
  } as Evidence;
}

const E1 = '01JD3K8Q8Z6V7X2N4M5P9R0T1A';
const E2 = '01JD3K8Q8Z6V7X2N4M5P9R0T1B';
const E3 = '01JD3K8Q8Z6V7X2N4M5P9R0T1C';

const PROJECTION = {
  schema_version: 1,
  concept_id: 'softmax',
  state: 'learning',
  dimensions: {
    recall: 0.9,
    understanding: null,
    reasoning: null,
    application: null,
    transfer: null,
  },
  confidence: 0.5,
  review_due_at: null,
  rules_version: 1,
  evidence_ids: [E1],
  explanation: [{ code: 'state.learning', params: {} }],
} as unknown as MasteryProjection;

const HISTORY = {
  schema_version: 1,
  at: '2026-11-19T10:00:00Z',
  state: 'learning',
  dimensions: {
    recall: 0.9,
    understanding: null,
    reasoning: null,
    application: null,
    transfer: null,
  },
  confidence: 0.5,
  rules_version: 1,
  cause: { kind: 'evidence', evidence_id: E1 },
} as unknown as MasteryHistoryEntry;

const TOO_NEW = { schema_version: 99, future: true };

/**
 * Repository 的契约测试。
 *
 * @param name - 实现的名字，用在测试标题里
 * @param create - 每个测试调用一次，返回一个空 Workspace 上的 Repository
 */
export function describeRepositoryContract(
  name: string,
  create: () => RepositoryContractSubject | Promise<RepositoryContractSubject>,
): void {
  describe(`Repository contract: ${name}`, () => {
    let repository: Repository;
    let seed: RepositorySeed;

    beforeEach(async () => {
      ({ repository, seed } = await create());
    });

    describe('reading single files', () => {
      it('reports missing files as missing', async () => {
        expect(await repository.getConcept('softmax')).toEqual({
          kind: 'missing',
        });
        expect(await repository.getCriteria('softmax')).toEqual({
          kind: 'missing',
        });
        expect(await repository.getSession('softmax', SESSION_ID)).toEqual({
          kind: 'missing',
        });
        expect(await repository.getMastery('softmax')).toEqual({
          kind: 'missing',
        });
        expect(await repository.getHistory('softmax')).toEqual({
          kind: 'missing',
        });
      });

      it('reads valid files', async () => {
        await seed.concept('softmax', CONCEPT);
        await seed.criteria('softmax', CRITERIA);
        await seed.session('softmax', SESSION_ID, SESSION);
        expect(await repository.getConcept('softmax')).toEqual({
          kind: 'found',
          value: CONCEPT,
        });
        expect(await repository.getCriteria('softmax')).toEqual({
          kind: 'found',
          value: CRITERIA,
        });
        expect(await repository.getSession('softmax', SESSION_ID)).toEqual({
          kind: 'found',
          value: SESSION,
        });
      });

      it('reports invalid files as unreadable, with issues', async () => {
        await seed.concept('softmax', { ...CONCEPT, name: '' });
        const read = await repository.getConcept('softmax');
        expect(read).toMatchObject({ kind: 'unreadable', tooNew: false });
        expect(
          read.kind === 'unreadable' ? read.issues.length : 0,
        ).toBeGreaterThan(0);
      });

      it('marks files from a newer version as tooNew', async () => {
        await seed.criteria('softmax', TOO_NEW);
        expect(await repository.getCriteria('softmax')).toMatchObject({
          kind: 'unreadable',
          tooNew: true,
        });
      });

      it('reports a file whose content does not match its location as unreadable', async () => {
        await seed.session('other', SESSION_ID, SESSION);
        expect(await repository.getSession('other', SESSION_ID)).toMatchObject({
          kind: 'unreadable',
          tooNew: false,
        });
      });
    });

    describe('listEvidence: never drops files silently', () => {
      it('returns nothing for a concept without evidence', async () => {
        expect(await repository.listEvidence('softmax')).toEqual({
          items: [],
          tooNew: [],
          unreadable: [],
        });
      });

      it('lists usable evidence sorted by id', async () => {
        await seed.evidence('softmax', E3, evidence(E3));
        await seed.evidence('softmax', E1, evidence(E1));
        await seed.evidence('softmax', E2, evidence(E2));
        const list = await repository.listEvidence('softmax');
        expect(list.items.map((e) => e.id)).toEqual([E1, E2, E3]);
        expect(list.tooNew).toEqual([]);
        expect(list.unreadable).toEqual([]);
      });

      it('reports too-new and unreadable evidence next to the usable items', async () => {
        await seed.evidence('softmax', E1, evidence(E1));
        await seed.evidence('softmax', E2, { ...TOO_NEW, id: E2 });
        await seed.evidence('softmax', E3, { ...evidence(E3), confidence: 7 });
        const list = await repository.listEvidence('softmax');
        expect(list.items.map((e) => e.id)).toEqual([E1]);
        expect(list.tooNew.map((e) => e.id)).toEqual([E2]);
        expect(list.unreadable.map((e) => e.id)).toEqual([E3]);
        expect(list.unreadable[0]?.issues.length).toBeGreaterThan(0);
        expect(list.tooNew[0]?.file).toContain(E2);
      });

      it('reports evidence stored under another concept as unreadable', async () => {
        await seed.evidence(
          'softmax',
          E1,
          evidence(E1, { concept_id: 'probability' }),
        );
        const list = await repository.listEvidence('softmax');
        expect(list.items).toEqual([]);
        expect(list.unreadable.map((e) => e.id)).toEqual([E1]);
      });
    });

    describe('appendEvidence: append only', () => {
      it('appends evidence that is then listed', async () => {
        expect(await repository.appendEvidence(evidence(E1))).toEqual({
          ok: true,
        });
        expect((await repository.listEvidence('softmax')).items).toEqual([
          evidence(E1),
        ]);
      });

      it('refuses an id that already exists and keeps the original', async () => {
        await repository.appendEvidence(evidence(E1));
        expect(
          await repository.appendEvidence(evidence(E1, { confidence: 0.1 })),
        ).toEqual({
          ok: false,
          reason: 'exists',
        });
        expect((await repository.listEvidence('softmax')).items).toEqual([
          evidence(E1),
        ]);
      });

      it('refuses invalid evidence and writes nothing', async () => {
        const result = await repository.appendEvidence(
          evidence(E1, { confidence: 2 }),
        );
        expect(result).toMatchObject({ ok: false, reason: 'invalid' });
        expect(
          result.ok === false && result.reason === 'invalid'
            ? result.issues.length
            : 0,
        ).toBeGreaterThan(0);
        expect(await repository.listEvidence('softmax')).toEqual({
          items: [],
          tooNew: [],
          unreadable: [],
        });
      });
    });

    describe('mastery projection', () => {
      it('writes, skips identical writes, and reads back', async () => {
        expect(await repository.writeMastery(PROJECTION)).toEqual({
          ok: true,
          written: true,
        });
        expect(await repository.writeMastery(PROJECTION)).toEqual({
          ok: true,
          written: false,
        });
        expect(await repository.getMastery('softmax')).toEqual({
          kind: 'found',
          value: PROJECTION,
        });
        const changed = { ...PROJECTION, confidence: 0.6 } as MasteryProjection;
        expect(await repository.writeMastery(changed)).toEqual({
          ok: true,
          written: true,
        });
        expect(await repository.getMastery('softmax')).toEqual({
          kind: 'found',
          value: changed,
        });
      });

      it('refuses to overwrite a projection written by a newer version', async () => {
        await seed.mastery('softmax', { ...TOO_NEW, concept_id: 'softmax' });
        expect(await repository.writeMastery(PROJECTION)).toMatchObject({
          ok: false,
          reason: 'too_new',
        });
        expect(await repository.getMastery('softmax')).toMatchObject({
          kind: 'unreadable',
          tooNew: true,
        });
      });

      it('refuses an invalid projection', async () => {
        const invalid = { ...PROJECTION, confidence: 3 } as MasteryProjection;
        expect(await repository.writeMastery(invalid)).toMatchObject({
          ok: false,
          reason: 'invalid',
        });
        expect(await repository.getMastery('softmax')).toEqual({
          kind: 'missing',
        });
      });
    });

    describe('mastery history: derived, replaced as a whole', () => {
      const second = { ...HISTORY, confidence: 0.6 } as MasteryHistoryEntry;

      it('writes, skips identical writes, and reads back', async () => {
        expect(await repository.writeHistory('softmax', [HISTORY])).toEqual({
          ok: true,
          written: true,
        });
        expect(await repository.writeHistory('softmax', [HISTORY])).toEqual({
          ok: true,
          written: false,
        });
        expect(
          await repository.writeHistory('softmax', [HISTORY, second]),
        ).toEqual({ ok: true, written: true });
        expect(await repository.getHistory('softmax')).toEqual({
          kind: 'found',
          value: [HISTORY, second],
        });
      });

      it('replaces earlier lines, not only appends', async () => {
        await repository.writeHistory('softmax', [HISTORY, second]);
        expect(await repository.writeHistory('softmax', [second])).toEqual({
          ok: true,
          written: true,
        });
        expect(await repository.getHistory('softmax')).toEqual({
          kind: 'found',
          value: [second],
        });
      });

      it('writes nothing for an empty history when there is no file', async () => {
        expect(await repository.writeHistory('softmax', [])).toEqual({
          ok: true,
          written: false,
        });
        expect(await repository.getHistory('softmax')).toEqual({
          kind: 'missing',
        });
      });

      it('empties an existing history', async () => {
        await repository.writeHistory('softmax', [HISTORY]);
        expect(await repository.writeHistory('softmax', [])).toEqual({
          ok: true,
          written: true,
        });
        expect(await repository.getHistory('softmax')).toEqual({
          kind: 'found',
          value: [],
        });
      });

      it('overwrites a history with a broken line (it is derived)', async () => {
        await seed.history('softmax', [{ schema_version: 1 }]);
        expect(await repository.writeHistory('softmax', [HISTORY])).toEqual({
          ok: true,
          written: true,
        });
        expect(await repository.getHistory('softmax')).toEqual({
          kind: 'found',
          value: [HISTORY],
        });
      });

      it('refuses to overwrite a history with a line from a newer version', async () => {
        await seed.history('softmax', [HISTORY, TOO_NEW]);
        expect(
          await repository.writeHistory('softmax', [HISTORY]),
        ).toMatchObject({ ok: false, reason: 'too_new' });
        expect(await repository.getHistory('softmax')).toMatchObject({
          kind: 'unreadable',
          tooNew: true,
        });
      });

      it('refuses an invalid entry and writes nothing', async () => {
        const result = await repository.writeHistory('softmax', [
          HISTORY,
          { ...HISTORY, confidence: 9 },
        ]);
        expect(result).toMatchObject({ ok: false, reason: 'invalid' });
        expect(await repository.getHistory('softmax')).toEqual({
          kind: 'missing',
        });
      });
    });
  });
}
