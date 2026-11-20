import { describe, expect, it } from 'vitest';

import {
  checkReferences,
  findCycles,
  type WorkspaceContents,
} from './references.js';

const graph = (edges: Record<string, string[]>) =>
  new Map(Object.entries(edges));

describe('findCycles', () => {
  it('finds nothing in a graph without cycles', () => {
    expect(findCycles(graph({ a: ['b'], b: ['c'], c: [] }))).toEqual([]);
  });

  it('reports a cycle once, starting from its smallest slug', () => {
    expect(findCycles(graph({ c: ['a'], a: ['b'], b: ['c'] }))).toEqual([
      ['a', 'b', 'c', 'a'],
    ]);
  });

  it('reports each strongly connected group once', () => {
    expect(
      findCycles(
        graph({
          a: ['b'],
          b: ['a'],
          x: ['y'],
          y: ['z'],
          z: ['x'],
          free: ['a'],
        }),
      ),
    ).toEqual([
      ['a', 'b', 'a'],
      ['x', 'y', 'z', 'x'],
    ]);
  });

  it('follows neighbours in slug order, and ignores missing concepts', () => {
    expect(
      findCycles(graph({ a: ['missing', 'c', 'b'], b: ['a'], c: ['a'] })),
    ).toEqual([['a', 'b', 'a']]);
  });
});

const EMPTY: WorkspaceContents = {
  concepts: new Map(),
  projects: new Map(),
  criteria: [],
  sessions: [],
  evidence: [],
  mastery: [],
  blindspots: [],
  interventions: [],
};

describe('checkReferences', () => {
  it('checks every kind of reference', () => {
    const issues = checkReferences({
      ...EMPTY,
      concepts: graph({ a: ['gone'] }),
      projects: new Map([['p', ['a', 'nope']]]),
      criteria: ['nope'],
      sessions: [['nope', 'S1']],
      evidence: [{ concept: 'a', id: 'E1', session: 'S9' }],
      mastery: [{ concept: 'nope', file: 'mastery/nope.yaml' }],
      blindspots: [
        { id: 'B1', concept: 'a', prerequisite: 'nope', mergedInto: 'B9' },
      ],
      interventions: [{ id: 'I1', blindspot: 'B8' }],
    });
    expect(issues.map((i) => [i.file, i.code])).toEqual([
      ['concepts/a.md', 'reference.prerequisite_missing'],
      ['projects/p/project.yaml', 'reference.concept_missing'],
      ['assessments/nope/criteria.yaml', 'reference.concept_missing'],
      ['assessments/nope/sessions/S1.json', 'reference.concept_missing'],
      ['evidence/a/E1.json', 'reference.session_missing'],
      ['mastery/nope.yaml', 'reference.concept_missing'],
      ['blindspots/B1.yaml', 'reference.concept_missing'],
      ['blindspots/B1.yaml', 'reference.blindspot_missing'],
      ['interventions/I1.yaml', 'reference.blindspot_missing'],
    ]);
  });

  it('accepts manual evidence without a session', () => {
    expect(
      checkReferences({
        ...EMPTY,
        concepts: graph({ a: [] }),
        evidence: [{ concept: 'a', id: 'E1', session: null }],
      }),
    ).toEqual([]);
  });
});
