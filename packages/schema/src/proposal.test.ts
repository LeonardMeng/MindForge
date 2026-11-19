import { describe, expect, it } from 'vitest';

import { PROPOSAL_OPERATIONS, Proposal } from './index.js';
import { codesOf, issuesOf } from './test-helpers.js';

const FRONTMATTER = {
  schema_version: 1,
  id: 'softmax',
  name: 'Softmax',
  prerequisites: ['probability'],
  status: 'draft',
};

const BODY =
  '# Softmax\n\n## Description\n把一组实数变成概率分布。\n\n## Learning Objectives\n- 写出公式\n';

const CRITERIA = {
  schema_version: 1,
  concept_id: 'softmax',
  version: 1,
  dimensions: {
    recall: { focus: ['写出公式'], threshold: 0.8 },
    understanding: null,
    reasoning: null,
    application: null,
    transfer: null,
  },
};

const BLINDSPOT = {
  schema_version: 1,
  id: '01JD6B0A0A0A0A0A0A0A0A0A0A',
  concept_id: 'self-attention',
  type: 'application',
  status: 'suspected',
  description: '遇到新例子不会用。',
  prerequisite_id: null,
  evidence_ids: [],
  source: { kind: 'agent', id: 'agent-diagnoser', model: 'ollama:qwen3-14b' },
  created_at: '2026-11-20T08:00:00Z',
};

const INTERVENTION = {
  schema_version: 1,
  id: '01JD6C0A0A0A0A0A0A0A0A0A0A',
  blindspot_id: '01JD6B0A0A0A0A0A0A0A0A0A0A',
  method: 'practice',
  content: '做三道没见过的题。',
  status: 'planned',
  closed_at: null,
  source: { kind: 'agent', id: 'agent-teacher', model: 'ollama:qwen3-14b' },
  created_at: '2026-11-20T08:10:00Z',
};

const OPERATIONS = {
  'concept.create': {
    op: 'concept.create',
    frontmatter: FRONTMATTER,
    body: BODY,
  },
  'concept.update': {
    op: 'concept.update',
    concept_id: 'softmax',
    frontmatter: { ...FRONTMATTER, status: 'active' },
    body: BODY,
  },
  'criteria.set': { op: 'criteria.set', criteria: CRITERIA },
  'blindspot.create': { op: 'blindspot.create', blindspot: BLINDSPOT },
  'blindspot.update': {
    op: 'blindspot.update',
    blindspot: { ...BLINDSPOT, status: 'confirmed' },
  },
  'blindspot.merge': {
    op: 'blindspot.merge',
    target_id: '01JD6B0A0A0A0A0A0A0A0A0A0A',
    source_ids: ['01JD6B1A0A0A0A0A0A0A0A0A0A', '01JD6B2A0A0A0A0A0A0A0A0A0A'],
  },
  'intervention.create': {
    op: 'intervention.create',
    intervention: INTERVENTION,
  },
  'intervention.update': {
    op: 'intervention.update',
    intervention: {
      ...INTERVENTION,
      status: 'abandoned',
      closed_at: '2026-11-20T09:00:00Z',
    },
  },
} as const;

const VALID = {
  schema_version: 1,
  id: '01JD6D0A0A0A0A0A0A0A0A0A0A',
  created_at: '2026-11-20T08:20:00Z',
  source: { kind: 'agent', id: 'agent-discovery', model: 'ollama:qwen3-14b' },
  run_id: '01JD6D0000000000000000000A',
  summary: '论文里用到了 softmax，但 Workspace 里还没有这个 Concept。',
  requires_approval: true,
  operations: [OPERATIONS['concept.create']],
};

const withOperation = (operation: unknown) => ({
  ...VALID,
  operations: [operation],
});

describe('Proposal', () => {
  it('accepts a valid proposal', () => {
    expect(codesOf(Proposal, VALID)).toEqual([]);
  });

  it('accepts a proposal from a human without an agent run', () => {
    expect(
      codesOf(Proposal, {
        ...VALID,
        source: { kind: 'human' },
        run_id: null,
        requires_approval: false,
      }),
    ).toEqual([]);
  });

  it.each([
    'schema_version',
    'id',
    'created_at',
    'source',
    'run_id',
    'summary',
    'requires_approval',
    'operations',
  ])('requires %s (run_id must be written even when null)', (field) => {
    const input: Record<string, unknown> = { ...VALID };
    delete input[field];
    expect(issuesOf(Proposal, input)).toEqual([[field, 'field.required']]);
  });

  it('rejects a non-boolean requires_approval', () => {
    expect(issuesOf(Proposal, { ...VALID, requires_approval: 'yes' })).toEqual([
      ['requires_approval', 'field.invalid_type'],
    ]);
  });

  it('rejects an empty summary', () => {
    expect(issuesOf(Proposal, { ...VALID, summary: '' })).toEqual([
      ['summary', 'field.empty'],
    ]);
  });

  it('does not carry an approval status (that belongs to the approval queue)', () => {
    expect(issuesOf(Proposal, { ...VALID, status: 'pending' })).toEqual([
      ['status', 'field.unknown'],
    ]);
  });

  describe('operations', () => {
    it('lists exactly the supported operations', () => {
      expect([...PROPOSAL_OPERATIONS].sort()).toEqual(
        Object.keys(OPERATIONS).sort(),
      );
    });

    it.each(Object.values(OPERATIONS))('accepts %j', (operation) => {
      expect(codesOf(Proposal, withOperation(operation))).toEqual([]);
    });

    it('accepts several operations in one proposal', () => {
      expect(
        codesOf(Proposal, {
          ...VALID,
          operations: [
            OPERATIONS['concept.create'],
            OPERATIONS['criteria.set'],
          ],
        }),
      ).toEqual([]);
    });

    it('rejects an empty list', () => {
      expect(issuesOf(Proposal, { ...VALID, operations: [] })).toEqual([
        ['operations', 'field.empty_list'],
      ]);
    });

    it.each([
      'concept.delete',
      'blindspot.delete',
      'evidence.create',
      'mastery.set',
    ])(
      'has no %s operation (no deletes; evidence and mastery do not go through proposals)',
      (op) => {
        expect(issuesOf(Proposal, withOperation({ op }))).toEqual([
          ['operations.0.op', 'field.invalid_option'],
        ]);
      },
    );

    it('requires op', () => {
      expect(issuesOf(Proposal, withOperation({ body: BODY }))).toEqual([
        ['operations.0.op', 'field.required'],
      ]);
    });

    it('validates the content of an operation with the entity schema', () => {
      expect(
        issuesOf(
          Proposal,
          withOperation({
            ...OPERATIONS['concept.create'],
            frontmatter: { ...FRONTMATTER, name: '' },
          }),
        ),
      ).toEqual([['operations.0.frontmatter.name', 'field.empty']]);
      expect(
        issuesOf(
          Proposal,
          withOperation({
            ...OPERATIONS['intervention.update'],
            intervention: { ...INTERVENTION, status: 'completed' },
          }),
        ),
      ).toEqual([
        [
          'operations.0.intervention.closed_at',
          'intervention.closed_at_required',
        ],
      ]);
    });

    it('rejects unknown fields in an operation', () => {
      expect(
        issuesOf(
          Proposal,
          withOperation({ ...OPERATIONS['criteria.set'], reason: 'x' }),
        ),
      ).toEqual([['operations.0.reason', 'field.unknown']]);
    });

    it('requires concept.update to keep the concept id', () => {
      expect(
        issuesOf(
          Proposal,
          withOperation({
            ...OPERATIONS['concept.update'],
            frontmatter: { ...FRONTMATTER, id: 'soft-max' },
          }),
        ),
      ).toEqual([
        ['operations.0.frontmatter.id', 'proposal.concept_id_mismatch'],
      ]);
    });

    describe('blindspot.merge', () => {
      const merge = OPERATIONS['blindspot.merge'];

      it('rejects merging a blindspot into itself', () => {
        expect(
          issuesOf(
            Proposal,
            withOperation({
              ...merge,
              source_ids: ['01JD6B1A0A0A0A0A0A0A0A0A0A', merge.target_id],
            }),
          ),
        ).toEqual([
          ['operations.0.source_ids.1', 'proposal.merge_includes_target'],
        ]);
      });

      it('requires at least one unique source', () => {
        expect(
          issuesOf(Proposal, withOperation({ ...merge, source_ids: [] })),
        ).toEqual([['operations.0.source_ids', 'field.empty_list']]);
        expect(
          issuesOf(
            Proposal,
            withOperation({
              ...merge,
              source_ids: [
                '01JD6B1A0A0A0A0A0A0A0A0A0A',
                '01JD6B1A0A0A0A0A0A0A0A0A0A',
              ],
            }),
          ),
        ).toEqual([['operations.0.source_ids.1', 'field.duplicate_item']]);
      });
    });
  });
});
