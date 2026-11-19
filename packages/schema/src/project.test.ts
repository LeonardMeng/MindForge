import { describe, expect, it } from 'vitest';

import { ProjectConfig } from './index.js';
import { codesOf, issuesOf } from './test-helpers.js';

const VALID = {
  schema_version: 1,
  id: 'read-attention-paper',
  name: '读懂 Attention Is All You Need',
  status: 'active',
  concepts: ['self-attention', 'multi-head-attention'],
};

describe('ProjectConfig', () => {
  it('accepts a valid project', () => {
    expect(codesOf(ProjectConfig, VALID)).toEqual([]);
  });

  it('accepts an empty concept list and an optional description', () => {
    expect(
      codesOf(ProjectConfig, {
        ...VALID,
        concepts: [],
        description: '先读论文',
      }),
    ).toEqual([]);
  });

  it.each(['active', 'paused', 'completed', 'archived'])(
    'accepts status %s',
    (status) => {
      expect(codesOf(ProjectConfig, { ...VALID, status })).toEqual([]);
    },
  );

  it('rejects an unknown status', () => {
    expect(issuesOf(ProjectConfig, { ...VALID, status: 'done' })).toEqual([
      ['status', 'field.invalid_option'],
    ]);
  });

  it.each(['schema_version', 'id', 'name', 'status', 'concepts'])(
    'requires %s',
    (field) => {
      const input: Record<string, unknown> = { ...VALID };
      delete input[field];
      expect(issuesOf(ProjectConfig, input)).toEqual([
        [field, 'field.required'],
      ]);
    },
  );

  it('rejects duplicate concepts', () => {
    expect(
      issuesOf(ProjectConfig, {
        ...VALID,
        concepts: ['softmax', 'embedding', 'softmax'],
      }),
    ).toEqual([['concepts.2', 'field.duplicate_item']]);
  });

  it('rejects an invalid concept slug with its index', () => {
    expect(
      issuesOf(ProjectConfig, { ...VALID, concepts: ['softmax', 'Soft Max'] }),
    ).toEqual([['concepts.1', 'slug.invalid_format']]);
  });

  it('tells the user to write a single concept as a list', () => {
    expect(issuesOf(ProjectConfig, { ...VALID, concepts: 'softmax' })).toEqual([
      ['concepts', 'field.expected_list'],
    ]);
  });

  it('rejects unknown fields', () => {
    expect(
      issuesOf(ProjectConfig, { ...VALID, deadline: '2026-12-01' }),
    ).toEqual([['deadline', 'field.unknown']]);
  });
});
