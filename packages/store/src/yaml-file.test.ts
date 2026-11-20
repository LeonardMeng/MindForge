import { MemoryFileSystem } from '@mastery/platform-memory';
import { describe, expect, it } from 'vitest';

import { yamlFile } from './index.js';
import { docExample } from './test-helpers.js';

const WORKSPACE = docExample('workspace.md', 'yaml');

async function setup(text?: string) {
  const fs = new MemoryFileSystem();
  if (text !== undefined) await fs.writeTextFile('settings.yaml', text);
  return { fs, file: yamlFile(fs, 'settings.yaml', 'workspace') };
}

describe('yamlFile: any file kind, same rules as the workspace files', () => {
  it('reads and validates, and saving the same value writes nothing', async () => {
    const { fs, file } = await setup(WORKSPACE);
    const read = await file.read();
    if (read?.ok !== true) throw new Error('not readable');
    expect(read.value.id).toBe('ai');
    expect(await file.save(read.value, { base: read.snapshot })).toMatchObject({
      ok: true,
      written: false,
    });
    expect(await fs.readTextFile('settings.yaml')).toBe(WORKSPACE);
  });

  it('changes only the edited line, keeping comments', async () => {
    const { fs, file } = await setup(WORKSPACE);
    const read = await file.read();
    if (read?.ok !== true) throw new Error('not readable');
    await file.save({ ...read.value, name: 'AI Lab' }, { base: read.snapshot });
    expect(await fs.readTextFile('settings.yaml')).toBe(
      WORKSPACE.replace('name: AI\n', 'name: AI Lab\n'),
    );
  });

  it('refuses to overwrite a change made since the read', async () => {
    const { fs, file } = await setup(WORKSPACE);
    const read = await file.read();
    if (read?.ok !== true) throw new Error('not readable');
    await fs.writeTextFile('settings.yaml', `${WORKSPACE}# edited\n`);
    const saved = await file.save(read.value, { base: read.snapshot });
    expect(saved.ok ? [] : saved.issues.map((i) => i.code)).toEqual([
      'store.modified_since_read',
    ]);
  });

  it('creates the file without a base, and refuses to create it twice', async () => {
    const source = await setup(WORKSPACE);
    const read = await source.file.read();
    if (read?.ok !== true) throw new Error('not readable');
    const { file } = await setup();
    expect(await file.read()).toBeNull();
    expect(await file.save(read.value)).toMatchObject({
      ok: true,
      written: true,
    });
    const again = await file.save(read.value);
    expect(again.ok ? [] : again.issues.map((i) => i.code)).toEqual([
      'store.already_exists',
    ]);
  });

  it('treats a file from a newer version as read only', async () => {
    const { file } = await setup('schema_version: 9\nid: ai\n');
    expect(await file.read()).toMatchObject({ ok: false, readOnly: true });
  });

  it('rejects YAML that breaks "one value, one form"', async () => {
    const { file } = await setup(
      'schema_version: 1\nid: !!str ai\nname: AI\nplugins: {}\n',
    );
    const read = await file.read();
    expect(read?.ok === false ? read.issues.map((i) => i.code) : []).toEqual([
      'yaml.tag_not_allowed',
    ]);
  });
});
