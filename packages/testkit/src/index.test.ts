import { describe, expect, it } from 'vitest';

import { fixtureFiles, loadFixture, type FixtureName } from './index.js';

describe('fixtureFiles', () => {
  it('includes dotfiles and nested files, sorted by path', () => {
    const paths = [...fixtureFiles('ws-transformers').keys()];
    expect(paths).toContain('.gitignore');
    expect(paths).toContain('workspace.yaml');
    expect(paths).toContain('notes/reading-log/2026-11.md');
    expect(paths).toEqual([...paths].sort());
  });

  it('returns a new map every time', () => {
    const first = fixtureFiles('ws-transformers');
    first.set('workspace.yaml', 'changed');
    first.delete('.gitignore');
    const second = fixtureFiles('ws-transformers');
    expect(second.get('workspace.yaml')).not.toBe('changed');
    expect(second.has('.gitignore')).toBe(true);
  });

  it('rejects an unknown fixture', () => {
    expect(() => fixtureFiles('missing' as FixtureName)).toThrow(
      'unknown fixture',
    );
  });
});

describe('loadFixture', () => {
  it('loads every file with its exact content', async () => {
    const fs = await loadFixture('ws-transformers');
    for (const [path, text] of fixtureFiles('ws-transformers')) {
      expect(await fs.readTextFile(path)).toBe(text);
    }
  });

  it('returns a fresh, independent file system on every call', async () => {
    const first = await loadFixture('ws-transformers');
    const second = await loadFixture('ws-transformers');
    expect(first).not.toBe(second);

    await first.writeTextFile('workspace.yaml', 'changed');
    await first.mkdir('evidence/softmax', { recursive: true });
    await first.writeTextFile('evidence/softmax/x.json', '{}');
    await first.remove('notes', { recursive: true });

    const original = fixtureFiles('ws-transformers').get('workspace.yaml');
    for (const fs of [second, await loadFixture('ws-transformers')]) {
      expect(await fs.readTextFile('workspace.yaml')).toBe(original);
      expect(await fs.stat('evidence')).toBeNull();
      expect(await fs.stat('notes/softmax-numerics.md')).not.toBeNull();
    }
  });
});
