import { describe, expect, it } from 'vitest';

import {
  formatGlobalConceptRef,
  GlobalConceptRef,
  IsoDateTime,
  parseGlobalConceptRef,
  SchemaVersion,
  Slug,
  toSchemaIssues,
  Ulid,
} from './index.js';
import { codesOf } from './test-helpers.js';
import { globalConceptRef, isoDateTime, slug, ulid } from './testing.js';

describe('SchemaVersion', () => {
  it.each([1, 2, 42])('accepts %s', (value) => {
    expect(codesOf(SchemaVersion, value)).toEqual([]);
  });

  it.each([0, -1, 1.5])('rejects %s', (value) => {
    expect(codesOf(SchemaVersion, value)).toEqual(['schema_version.invalid']);
  });

  it.each(['1', null, undefined, Number.NaN])(
    'rejects non-number %s',
    (value) => {
      expect(codesOf(SchemaVersion, value)).toEqual(['field.invalid_type']);
    },
  );
});

describe('Slug', () => {
  it.each([
    'a',
    'self-attention',
    'matrix-multiplication',
    '3d-geometry',
    'a1-b2-c3',
    'x'.repeat(64),
  ])('accepts %s', (value) => {
    expect(codesOf(Slug, value)).toEqual([]);
  });

  it.each([
    '',
    'Self-Attention',
    'self_attention',
    'self attention',
    '-attention',
    'attention-',
    'self--attention',
    'café',
    'ai:self-attention',
  ])('rejects %j', (value) => {
    expect(codesOf(Slug, value)).toEqual(['slug.invalid_format']);
  });

  it('rejects a slug longer than 64 characters', () => {
    expect(codesOf(Slug, 'x'.repeat(65))).toEqual(['slug.too_long']);
  });

  it('reports both problems when a slug is too long and malformed', () => {
    expect(codesOf(Slug, 'X'.repeat(65))).toEqual([
      'slug.invalid_format',
      'slug.too_long',
    ]);
  });

  it('rejects non-strings', () => {
    expect(codesOf(Slug, 42)).toEqual(['field.invalid_type']);
  });

  it('carries the offending value in the error params', () => {
    const result = Slug.safeParse('Bad');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toSchemaIssues(result.error)[0]?.params).toEqual({ value: 'Bad' });
    }
  });
});

describe('GlobalConceptRef', () => {
  it.each(['ai:self-attention', 'math:matrix-multiplication', 'a:b'])(
    'accepts %s',
    (value) => {
      expect(codesOf(GlobalConceptRef, value)).toEqual([]);
    },
  );

  it.each([
    'self-attention',
    'ai:self-attention:extra',
    'ai::self-attention',
    '',
  ])('rejects %j as not <workspace>:<slug>', (value) => {
    expect(codesOf(GlobalConceptRef, value)).toEqual([
      'global_concept_ref.invalid_format',
    ]);
  });

  it.each([':self-attention', 'AI:self-attention', 'my_ws:self-attention'])(
    'rejects %j for its workspace part',
    (value) => {
      expect(codesOf(GlobalConceptRef, value)).toEqual([
        'global_concept_ref.invalid_workspace',
      ]);
    },
  );

  it.each(['ai:', 'ai:Self-Attention', `ai:${'x'.repeat(65)}`])(
    'rejects %j for its slug part',
    (value) => {
      expect(codesOf(GlobalConceptRef, value)).toEqual([
        'global_concept_ref.invalid_slug',
      ]);
    },
  );

  it('parses into workspace and slug, and formats back', () => {
    const ref = globalConceptRef('ai:self-attention');
    const parts = parseGlobalConceptRef(ref);
    expect(parts).toEqual({ workspace: 'ai', slug: 'self-attention' });
    expect(formatGlobalConceptRef(parts.workspace, parts.slug)).toBe(ref);
  });

  it('formats from two slugs', () => {
    expect(formatGlobalConceptRef(slug('math'), slug('probability'))).toBe(
      'math:probability',
    );
  });
});

describe('Ulid', () => {
  // 前三个取自 README 第 7 节的示例。
  it.each([
    '01JD3K8Q8Z6V7X2N4M5P9R0T1W',
    '01JD3K7A2B3C4D5E6F7G8H9J0K',
    '01JD4A0Y3S8M2K7Q5N1V6B9C0D',
    '00000000000000000000000000',
    '7ZZZZZZZZZZZZZZZZZZZZZZZZZ',
  ])('accepts %s', (value) => {
    expect(codesOf(Ulid, value)).toEqual([]);
  });

  it.each(['', '01JD3K8Q8Z6V7X2N4M5P9R0T1', '01JD3K8Q8Z6V7X2N4M5P9R0T1WX'])(
    'rejects %j for its length',
    (value) => {
      expect(codesOf(Ulid, value)).toEqual(['ulid.invalid_length']);
    },
  );

  it('rejects lowercase (storage format is uppercase only)', () => {
    expect(codesOf(Ulid, '01jd3k8q8z6v7x2n4m5p9r0t1w')).toEqual([
      'ulid.not_uppercase',
    ]);
  });

  it.each(['I', 'L', 'O', 'U', '-', '*'])(
    'rejects the character %s',
    (char) => {
      expect(codesOf(Ulid, `01JD3K8Q8Z6V7X2N4M5P9R0T1${char}`)).toEqual([
        'ulid.invalid_character',
      ]);
    },
  );

  it('rejects a timestamp that overflows 48 bits', () => {
    expect(codesOf(Ulid, '8ZZZZZZZZZZZZZZZZZZZZZZZZZ')).toEqual([
      'ulid.timestamp_overflow',
    ]);
  });

  it('rejects non-strings', () => {
    expect(codesOf(Ulid, 123)).toEqual(['field.invalid_type']);
  });
});

describe('IsoDateTime', () => {
  it.each([
    '2026-11-19T10:00:00Z',
    '2026-01-01T00:00:00Z',
    '2026-12-31T23:59:59Z',
    '2028-02-29T12:00:00Z',
  ])('accepts %s', (value) => {
    expect(codesOf(IsoDateTime, value)).toEqual([]);
  });

  it.each([
    '2026-11-19T10:00:00.000Z',
    '2026-11-19T10:00:00.5Z',
    '2026-11-19T10:00:00+11:00',
    '2026-11-19T10:00:00+00:00',
    '2026-11-19T10:00:00',
    '2026-11-19T10:00Z',
    '2026-11-19',
    '2026-11-19 10:00:00Z',
    '2026-11-19t10:00:00z',
    '26-11-19T10:00:00Z',
    '',
  ])('rejects %j (only YYYY-MM-DDTHH:mm:ssZ is allowed)', (value) => {
    expect(codesOf(IsoDateTime, value)).toEqual([
      'iso_datetime.invalid_format',
    ]);
  });

  it.each([
    '2026-02-29T00:00:00Z',
    '2026-02-30T00:00:00Z',
    '2026-04-31T00:00:00Z',
    '2026-13-01T00:00:00Z',
    '2026-00-10T00:00:00Z',
    '2026-11-19T24:00:00Z',
    '2026-11-19T10:60:00Z',
    '2026-11-19T10:00:60Z',
  ])('rejects %s as a non-existent date or time', (value) => {
    expect(codesOf(IsoDateTime, value)).toEqual(['iso_datetime.invalid_date']);
  });
});

describe('test constructors', () => {
  it('return the value when it is valid', () => {
    expect(slug('self-attention')).toBe('self-attention');
    expect(ulid('01JD3K8Q8Z6V7X2N4M5P9R0T1W')).toBe(
      '01JD3K8Q8Z6V7X2N4M5P9R0T1W',
    );
    expect(isoDateTime('2026-11-19T10:00:00Z')).toBe('2026-11-19T10:00:00Z');
  });

  it('throw when the value is invalid', () => {
    expect(() => slug('Bad Slug')).toThrow();
    expect(() => ulid('not-a-ulid')).toThrow();
    expect(() => globalConceptRef('no-colon')).toThrow();
    expect(() => isoDateTime('2026-11-19')).toThrow();
  });
});
