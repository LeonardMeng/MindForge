import { describe, expect, it } from 'vitest';

import { joinFrontmatter, splitFrontmatter } from './frontmatter.js';

function split(text: string) {
  const result = splitFrontmatter(text);
  if (!result.ok) throw new Error(result.code);
  return result.parts;
}

describe('splitFrontmatter', () => {
  it('splits the YAML from the body', () => {
    const parts = split('---\nid: a\n---\n# A\n\n---\nnot frontmatter\n');
    expect(parts.yaml).toBe('id: a\n');
    expect(parts.body).toBe('# A\n\n---\nnot frontmatter\n');
    expect(parts.eol).toBe('\n');
    expect(parts.bom).toBe('');
  });

  it.each([
    ['LF', '---\nid: a\n---\nbody\n'],
    ['CRLF', '---\r\nid: a\r\n---\r\nbody\r\n'],
    ['a BOM', '\uFEFF---\nid: a\n---\nbody\n'],
    ['no body', '---\nid: a\n---\n'],
    ['no newline after the closing line', '---\nid: a\n---'],
    ['empty frontmatter', '---\n---\nbody'],
  ])('joins back to the same bytes with %s', (_name, text) => {
    expect(joinFrontmatter(split(text))).toBe(text);
  });

  it('remembers CRLF and the BOM', () => {
    const parts = split('\uFEFF---\r\nid: a\r\n---\r\nbody\r\n');
    expect(parts.eol).toBe('\r\n');
    expect(parts.bom).toBe('\uFEFF');
    expect(parts.yaml).toBe('id: a\r\n');
  });

  it.each([
    ['no frontmatter', '# Title\n'],
    ['an empty file', ''],
    ['text before the opening line', '\n---\nid: a\n---\n'],
    ['an opening line with extra text', '--- x\nid: a\n---\n'],
  ])('reports frontmatter.missing for %s', (_name, text) => {
    expect(splitFrontmatter(text)).toEqual({
      ok: false,
      code: 'frontmatter.missing',
    });
  });

  it.each([
    ['no closing line', '---\nid: a\n'],
    ['a closing line with extra text', '---\nid: a\n--- \nbody\n'],
    ['a closing line that is indented', '---\nid: a\n ---\nbody\n'],
    ['"..." instead of "---"', '---\nid: a\n...\nbody\n'],
  ])('reports frontmatter.unclosed for %s', (_name, text) => {
    expect(splitFrontmatter(text)).toEqual({
      ok: false,
      code: 'frontmatter.unclosed',
    });
  });
});
