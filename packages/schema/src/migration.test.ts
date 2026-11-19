// 迁移框架本身的测试，用一张只在测试里存在的假迁移表：v1 → v2 → v3。
// 真实文件现在都是 v1，见 file-kinds.test.ts。
import { describe, expect, it } from 'vitest';

import { createMigrator, type MigrationResult } from './index.js';

/**
 * 假的 note 文件：
 * - v1 → v2：把 title 改名为 name；
 * - v2 → v3：增加 tags，默认 []。
 */
const migrateTest = createMigrator({
  note: {
    currentVersion: 3,
    steps: {
      1: ({ title, ...rest }) => ({ ...rest, name: title }),
      2: (data) => ({ ...data, tags: [] }),
    },
  },
  'missing-step': {
    currentVersion: 3,
    steps: { 1: (data) => ({ ...data }) },
  },
  throws: {
    currentVersion: 2,
    steps: {
      1: () => {
        throw new Error('boom');
      },
    },
  },
  'returns-null': {
    currentVersion: 2,
    steps: { 1: () => null as unknown as Record<string, unknown> },
  },
  'mutates-input': {
    currentVersion: 2,
    steps: {
      1: (data) => {
        (data as Record<string, unknown>).name = 'changed';
        return data;
      },
    },
  },
  'only-v1': { currentVersion: 1, steps: {} },
});

/** 深度冻结，用来确认迁移不会修改输入。 */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const codesOf = (result: MigrationResult) =>
  result.success ? [] : result.issues.map((i) => [i.path.join('.'), i.code]);

describe('createMigrator', () => {
  describe('upgrading', () => {
    it('upgrades v1 step by step to the latest version', () => {
      expect(
        migrateTest('note', {
          schema_version: 1,
          title: 'Softmax',
          extra: { kept: true },
        }),
      ).toEqual({
        success: true,
        data: {
          schema_version: 3,
          name: 'Softmax',
          tags: [],
          extra: { kept: true },
        },
        from: 1,
        to: 3,
      });
    });

    it('upgrades v2 to the latest version', () => {
      expect(
        migrateTest('note', { schema_version: 2, name: 'Softmax' }),
      ).toEqual({
        success: true,
        data: { schema_version: 3, name: 'Softmax', tags: [] },
        from: 2,
        to: 3,
      });
    });

    it('returns data that is already current unchanged', () => {
      const data = { schema_version: 3, name: 'Softmax', tags: ['ml'] };
      expect(migrateTest('note', data)).toEqual({
        success: true,
        data,
        from: 3,
        to: 3,
      });
    });

    it('sets schema_version itself after every step', () => {
      const seen: unknown[] = [];
      const migrate = createMigrator({
        x: {
          currentVersion: 3,
          steps: {
            1: (data) => {
              seen.push(data.schema_version);
              return { ...data, schema_version: 99 };
            },
            2: (data) => {
              seen.push(data.schema_version);
              return { ...data };
            },
          },
        },
      });
      const result = migrate('x', { schema_version: 1 });
      expect(seen).toEqual([1, 2]);
      expect(result.success && result.data.schema_version).toBe(3);
    });

    it('does not modify its input', () => {
      const input = deepFreeze({
        schema_version: 1,
        title: 'Softmax',
        extra: { a: [1] },
      });
      const result = migrateTest('note', input);
      expect(result.success).toBe(true);
      expect(input).toEqual({
        schema_version: 1,
        title: 'Softmax',
        extra: { a: [1] },
      });
    });

    it('accepts a kind that has no migrations yet', () => {
      expect(migrateTest('only-v1', { schema_version: 1 })).toMatchObject({
        success: true,
        from: 1,
        to: 1,
      });
    });
  });

  describe('errors', () => {
    it.each([null, [], 'note', 1])(
      'rejects %j as not a file object',
      (data) => {
        expect(codesOf(migrateTest('note', data))).toEqual([
          ['', 'migration.missing_version'],
        ]);
      },
    );

    it('rejects a file without schema_version', () => {
      expect(codesOf(migrateTest('note', { title: 'x' }))).toEqual([
        ['schema_version', 'migration.missing_version'],
      ]);
    });

    it.each(['1', 0, -1, 1.5, null, Number.NaN])(
      'rejects schema_version %j',
      (version) => {
        expect(
          codesOf(migrateTest('note', { schema_version: version })),
        ).toEqual([['schema_version', 'migration.invalid_version']]);
      },
    );

    it('rejects a version newer than this Mastery OS understands', () => {
      const result = migrateTest('note', { schema_version: 4 });
      expect(codesOf(result)).toEqual([
        ['schema_version', 'migration.version_too_new'],
      ]);
      expect(result.success ? null : result.issues[0]?.params).toEqual({
        version: 4,
        latest: 3,
      });
    });

    it('rejects a version with no migration path', () => {
      const result = migrateTest('missing-step', { schema_version: 1 });
      expect(codesOf(result)).toEqual([
        ['schema_version', 'migration.no_path'],
      ]);
      expect(result.success ? null : result.issues[0]?.params).toEqual({
        version: 1,
        missing_step: 2,
        latest: 3,
      });
    });

    it('reports a step that throws', () => {
      const result = migrateTest('throws', { schema_version: 1 });
      expect(codesOf(result)).toEqual([['', 'migration.step_failed']]);
      expect(result.success ? null : result.issues[0]?.params).toMatchObject({
        from: 1,
        to: 2,
        detail: 'boom',
      });
    });

    it('reports a step that does not return an object', () => {
      expect(
        codesOf(migrateTest('returns-null', { schema_version: 1 })),
      ).toEqual([['', 'migration.step_failed']]);
    });

    it('reports a step that tries to modify its frozen input', () => {
      expect(
        codesOf(
          migrateTest(
            'mutates-input',
            deepFreeze({ schema_version: 1, name: 'x' }),
          ),
        ),
      ).toEqual([['', 'migration.step_failed']]);
    });
  });
});
