// 真实文件的登记表、migrate() 和 validateFile()。
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import evidenceExample from '../../../docs/protocol/examples/evidence.json' with { type: 'json' };
import {
  FILE_KIND_NAMES,
  FILE_KINDS,
  migrate,
  validateFile,
  type FileKind,
} from './index.js';

describe('FILE_KINDS', () => {
  it('registers every file of the protocol', () => {
    expect([...FILE_KIND_NAMES]).toEqual([
      'workspace',
      'project',
      'concept-frontmatter',
      'criteria',
      'assessment-session',
      'evidence',
      'mastery-projection',
      'mastery-history-entry',
      'blindspot',
      'intervention',
      'proposal',
      'profile',
      'workspace-registry',
      'concept-links',
      'profile-defaults',
      'device',
    ]);
  });

  it.each(FILE_KIND_NAMES)(
    "%s: the schema's schema_version is the registered current version",
    (kind) => {
      const { schema, currentVersion } = FILE_KINDS[kind];
      const json = z.toJSONSchema(schema, { io: 'output' }) as unknown as {
        properties: { schema_version: { const: unknown } };
      };
      expect(json.properties.schema_version.const).toBe(currentVersion);
    },
  );

  it.each(FILE_KIND_NAMES)(
    '%s: every file kind is at version 1 for now',
    (kind) => {
      expect(FILE_KINDS[kind].currentVersion).toBe(1);
    },
  );
});

describe('migrate', () => {
  it.each(FILE_KIND_NAMES)('%s: passes version 1 through unchanged', (kind) => {
    const data = { schema_version: 1, anything: 'kept' };
    expect(migrate(kind, data)).toEqual({
      success: true,
      data,
      from: 1,
      to: 1,
    });
  });

  it.each(FILE_KIND_NAMES)('%s: rejects version 2 as too new', (kind) => {
    const result = migrate(kind, { schema_version: 2 });
    expect(result.success ? [] : result.issues.map((i) => i.code)).toEqual([
      'migration.version_too_new',
    ]);
  });
});

describe('validateFile', () => {
  it('migrates and validates a file', () => {
    const result = validateFile('evidence', evidenceExample);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.from).toBe(1);
      expect(result.to).toBe(1);
      // 类型按文件种类推导出来。
      const id: string = result.data.id;
      expect(id).toBe(evidenceExample.id);
    }
  });

  it('reports a version that is too new without validating the content', () => {
    const result = validateFile('evidence', {
      ...evidenceExample,
      schema_version: 2,
    });
    expect(result.success ? [] : result.issues.map((i) => i.code)).toEqual([
      'migration.version_too_new',
    ]);
  });

  it('reports validation errors of the migrated data', () => {
    const withoutNote: Record<string, unknown> = { ...evidenceExample };
    delete withoutNote.note;
    const result = validateFile('evidence', withoutNote);
    expect(
      result.success
        ? []
        : result.issues.map((i) => [i.path.join('.'), i.code]),
    ).toEqual([['note', 'field.required']]);
  });

  it('keeps unknown fields of a concept frontmatter', () => {
    const frontmatter = {
      schema_version: 1,
      id: 'softmax',
      name: 'Softmax',
      prerequisites: [],
      status: 'draft',
      cssclasses: ['wide'],
    };
    const result = validateFile('concept-frontmatter', frontmatter);
    expect(result).toMatchObject({ success: true, data: frontmatter });
  });

  it('accepts every kind name as a FileKind', () => {
    const kinds: FileKind[] = [...FILE_KIND_NAMES];
    expect(kinds).toHaveLength(16);
  });
});
