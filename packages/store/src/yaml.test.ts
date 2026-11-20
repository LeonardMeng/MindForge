import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { deepEqual } from './equal.js';
import { parseYaml, patchYaml, stringifyYaml } from './yaml.js';

/** 解析，要求成功。 */
function parsed(text: string) {
  const result = parseYaml(text);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result;
}

/** 解析，要求失败，返回错误码。 */
function codes(text: string): string[] {
  const result = parseYaml(text);
  if (result.ok) throw new Error(`expected "${text}" to be rejected`);
  return result.issues.map((issue) => issue.code);
}

describe('parseYaml: YAML 1.2 core schema, one value one form (ADR-0013)', () => {
  it('keeps unquoted timestamps and yes / no / on / off as strings', () => {
    expect(
      parsed('at: 2026-11-20T08:00:00Z\na: yes\nb: no\nc: on\nd: off\n').data,
    ).toEqual({
      at: '2026-11-20T08:00:00Z',
      a: 'yes',
      b: 'no',
      c: 'on',
      d: 'off',
    });
  });

  it('parses an empty file as null', () => {
    expect(parsed('').data).toBeNull();
    expect(parsed('# only a comment\n').data).toBeNull();
  });

  it.each([
    ['an anchor and an alias', 'a: &x 1\nb: *x\n', 'yaml.anchor_not_allowed'],
    ['an alias without an anchor', 'a: [1]\nb: *x\n', 'yaml.alias_not_allowed'],
    [
      'the merge key',
      'base: {a: 1}\n<<: {a: 2}\n',
      'yaml.merge_key_not_allowed',
    ],
    ['a quoted merge key', "'<<': 1\n", 'yaml.merge_key_not_allowed'],
    ['a standard tag', 'a: !!str 1\n', 'yaml.tag_not_allowed'],
    ['a custom tag', 'a: !foo x\n', 'yaml.tag_not_allowed'],
    ['a tag on a collection', 'a: !!map {b: 1}\n', 'yaml.tag_not_allowed'],
    ['duplicate keys', 'a: 1\nb: 2\na: 3\n', 'yaml.duplicate_key'],
    [
      'duplicate keys, quoted and plain',
      'a: 1\n"a": 2\n',
      'yaml.duplicate_key',
    ],
    ['two documents', 'a: 1\n---\nb: 2\n', 'yaml.multiple_documents'],
    [
      'a %YAML directive',
      '%YAML 1.1\n---\na: 1\n',
      'yaml.directive_not_allowed',
    ],
    [
      'a %TAG directive',
      '%TAG !e! tag:e.com:\n---\na: 1\n',
      'yaml.directive_not_allowed',
    ],
    ['a number as a key', '1: x\n', 'yaml.key_not_string'],
    ['a null key', ': x\n', 'yaml.key_not_string'],
    ['a collection as a key', '? [a]\n: x\n', 'yaml.key_not_string'],
    ['a syntax error', 'a: [1, 2\n', 'yaml.syntax'],
    ['bad indentation', 'a:\n  b: 1\n c: 2\n', 'yaml.syntax'],
  ])('rejects %s', (_name, text, code) => {
    expect(codes(text)).toContain(code);
  });

  it('reports both the anchor and the alias', () => {
    expect(codes('a: &x 1\nb: *x\n')).toEqual([
      'yaml.anchor_not_allowed',
      'yaml.alias_not_allowed',
    ]);
  });

  it('reports the line of the problem', () => {
    const result = parseYaml('a: 1\nb: !!str 2\n');
    expect(result.ok ? [] : result.issues[0]?.params).toMatchObject({
      line: 2,
    });
  });
});

/** 文件里会出现的各种“刁钻”字符串。 */
const trickyString = fc.oneof(
  fc.string({ unit: 'grapheme', maxLength: 20 }),
  fc.constantFrom(
    '',
    'yes',
    'No',
    'on',
    '~',
    'null',
    '1',
    '-1',
    '0x1F',
    '1.0',
    '1e3',
    '.inf',
    '2026-11-20T08:00:00Z',
    '2026-11-20',
    'a: b',
    'a #b',
    '#c',
    '- x',
    '[x]',
    '{x}',
    '*a',
    '&a',
    '!t',
    '%d',
    '@at',
    '`tick',
    '"',
    "'",
    ' lead',
    'trail ',
    'multi\nline',
    'multi\nline\n',
    '\n',
    '\ttab',
    'r\u00e9sum\u00e9',
    '\u2028',
    '---',
    '...',
    '<<',
  ),
);

const scalar = fc.oneof(
  trickyString,
  fc.integer({ min: -1_000_000, max: 1_000_000 }),
  fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 }),
  fc.boolean(),
  fc.constant(null),
);

const key = fc.stringMatching(/^[a-z][a-z0-9_-]{0,9}$/);

const { object: yamlObject } = fc.letrec((tie) => ({
  value: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    scalar,
    fc.array(tie('value'), { maxLength: 4 }),
    tie('object'),
  ),
  object: fc.dictionary(key, tie('value'), { maxKeys: 5 }),
}));

describe('stringifyYaml: one canonical form', () => {
  it('round-trips any object', () => {
    fc.assert(
      fc.property(yamlObject, (value) => {
        const text = stringifyYaml(value);
        expect(deepEqual(parsed(text).data, value)).toBe(true);
      }),
    );
  });

  it('is stable: a canonical file read and written again is byte-identical', () => {
    fc.assert(
      fc.property(yamlObject, (value) => {
        const text = stringifyYaml(value);
        expect(stringifyYaml(parsed(text).data)).toBe(text);
      }),
    );
  });

  it('keeps the key order it is given, puts lists of scalars in flow style and quotes YAML 1.1 lookalikes', () => {
    expect(
      stringifyYaml({
        schema_version: 1,
        name: 'yes',
        at: '2026-11-20T08:00:00Z',
        tags: ['a', 'b'],
        empty: [],
        items: [{ a: 1 }],
        note: null,
      }),
    ).toBe(
      [
        'schema_version: 1',
        'name: "yes"',
        'at: "2026-11-20T08:00:00Z"',
        'tags: [a, b]',
        'empty: []',
        'items:',
        '  - a: 1',
        'note: null',
        '',
      ].join('\n'),
    );
  });

  it('does not fold long lines', () => {
    const long = 'word '.repeat(40).trim();
    expect(stringifyYaml({ long })).toBe(`long: ${long}\n`);
  });
});

describe('patchYaml: only what changed is touched', () => {
  const SOURCE = [
    '# Workspace config',
    'schema_version: 1   # version',
    'id:   ai',
    "name: 'AI Notes'",
    'tags: [a,b]  # flow',
    'nested:',
    '  # inner',
    '  x: 1',
    '',
    '  y: two',
    '',
  ].join('\n');

  function patch(source: string, next: unknown): string {
    return patchYaml(source, parsed(source), next);
  }

  it('returns the source unchanged when nothing changed', () => {
    expect(patch(SOURCE, parsed(SOURCE).data)).toBe(SOURCE);
  });

  it('replaces only the changed scalar, keeping quoting, spacing and comments', () => {
    const next = {
      ...(parsed(SOURCE).data as object),
      name: 'AI Notes 2',
      nested: { x: 2, y: 'two' },
    };
    expect(patch(SOURCE, next)).toBe(
      SOURCE.replace("'AI Notes'", "'AI Notes 2'").replace('x: 1', 'x: 2'),
    );
  });

  it('replaces an item inside a flow list in place', () => {
    const next = { ...(parsed(SOURCE).data as object), tags: ['a', 'c'] };
    expect(patch(SOURCE, next)).toBe(SOURCE.replace('[a,b]', '[a,c]'));
  });

  it('falls back to re-serializing when a value cannot be replaced in place, keeping comments', () => {
    const next = { ...(parsed(SOURCE).data as object), tags: ['a', 'b, c'] };
    const text = patch(SOURCE, next);
    expect(parsed(text).data).toEqual(next);
    expect(text).toContain('# Workspace config');
    expect(text).toContain('# version');
    expect(text).toContain('# inner');
    expect(text).toContain("'AI Notes'");
  });

  it('inserts a new key after the keys that come before it, and removes deleted keys', () => {
    const source = 'a: 1 # one\nc: 3\nd: 4\n';
    const text = patch(source, { a: 1, b: 2, c: 3 });
    expect(text).toBe('a: 1 # one\nb: 2\nc: 3\n');
  });

  it('keeps CRLF line endings and a BOM', () => {
    const source = '\uFEFFa: 1\r\n# keep\r\nb: x\r\n';
    expect(patch(source, { a: 2, b: 'x' })).toBe(
      '\uFEFFa: 2\r\n# keep\r\nb: x\r\n',
    );
    const structural = patch(source, { a: 1, b: 'x', c: [1, 2] });
    expect(structural.startsWith('\uFEFF')).toBe(true);
    expect(structural.replace(/\r\n/g, '')).not.toContain('\n');
    expect(parsed(structural).data).toEqual({ a: 1, b: 'x', c: [1, 2] });
  });

  it('turns any object into any other object', () => {
    fc.assert(
      fc.property(yamlObject, yamlObject, (before, after) => {
        const source = stringifyYaml(before);
        const text = patch(source, after);
        expect(deepEqual(parsed(text).data, after)).toBe(true);
      }),
    );
  });

  it('changes a single scalar without touching other lines when it fits on one line', () => {
    const singleLine = scalar.filter(
      (v) => typeof v !== 'string' || !/[\r\n]/.test(v),
    );
    fc.assert(
      fc.property(
        fc.dictionary(key, singleLine, { minKeys: 2, maxKeys: 6 }),
        singleLine,
        (before, value) => {
          const target = Object.keys(before)[0] ?? '';
          const after = { ...before, [target]: value };
          const source = stringifyYaml(before);
          const text = patch(source, after);
          expect(deepEqual(parsed(text).data, after)).toBe(true);
          const others = (t: string) =>
            t
              .split('\n')
              .filter(
                (line) =>
                  !line.startsWith(`${target}:`) &&
                  !line.startsWith(`"${target}":`),
              );
          expect(others(text)).toEqual(others(source));
        },
      ),
    );
  });
});
