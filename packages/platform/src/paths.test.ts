import { describe, expect, it } from 'vitest';

import {
  baseName,
  isTempFileName,
  joinPath,
  normalizePath,
  parentPath,
  PlatformError,
  TEMP_FILE_PREFIX,
} from './index.js';

/** normalizePath 失败时的 reason 参数；通过时返回 null。 */
function reasonOf(path: string): unknown {
  try {
    normalizePath(path);
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(PlatformError);
    const platformError = error as PlatformError;
    expect(platformError.code).toBe('platform.invalid_path');
    return platformError.params.reason;
  }
}

describe('normalizePath', () => {
  it.each([
    'workspace.yaml',
    'concepts/self-attention.md',
    'evidence/softmax/01JD3K8Q8Z6V7X2N4M5P9R0T1W.json',
    '.gitignore',
    '.mastery/index.db',
    'notes/读书笔记 第一章.md',
    'résumé.md',
    'a/b/c/d.txt',
    'CONSOLE.md',
    'nullable.md',
    'com10.txt',
    'file.name.with.dots.md',
  ])('accepts %j', (path) => {
    expect(reasonOf(path)).toBeNull();
    expect(normalizePath(path)).toBe(path.normalize('NFC'));
  });

  it('treats the empty string as the root', () => {
    expect(normalizePath('')).toBe('');
  });

  describe('separators and relative paths', () => {
    it.each(['/etc/passwd', '/', '//x'])(
      'rejects the absolute path %j',
      (path) => {
        expect(reasonOf(path)).toBe('absolute');
      },
    );

    it.each(['C:/Users/x', 'c:', 'D:file.txt'])(
      'rejects the drive path %j',
      (path) => {
        expect(reasonOf(path)).toBe('absolute');
      },
    );

    it.each(['a\\b', 'concepts\\x.md', '\\\\server\\share'])(
      'rejects the backslash in %j (only / is a separator)',
      (path) => {
        expect(reasonOf(path)).toBe('backslash');
      },
    );

    it.each(['a//b', 'a/', 'a/b/'])(
      'rejects the empty segment in %j',
      (path) => {
        expect(reasonOf(path)).toBe('empty_segment');
      },
    );

    it.each(['.', '..', '../x', 'a/../b', 'a/./b', 'a/..'])(
      'rejects the dot segment in %j',
      (path) => {
        expect(reasonOf(path)).toBe('dot_segment');
      },
    );
  });

  describe('Unicode', () => {
    it('normalizes to NFC', () => {
      const nfd = 'notes/re\u0301sume\u0301.md';
      const nfc = 'notes/r\u00e9sum\u00e9.md';
      expect(nfd).not.toBe(nfc);
      expect(normalizePath(nfd)).toBe(nfc);
      expect(normalizePath(nfc)).toBe(nfc);
    });

    it('keeps already normalized Chinese names unchanged', () => {
      expect(normalizePath('notes/注意力机制.md')).toBe('notes/注意力机制.md');
    });
  });

  describe('names Windows does not allow', () => {
    it.each([
      'CON',
      'con',
      'Prn',
      'AUX',
      'nul',
      'COM1',
      'com9',
      'LPT1',
      'lpt9',
    ])('rejects the reserved name %j', (name) => {
      expect(reasonOf(name)).toBe('reserved_name');
      expect(reasonOf(`notes/${name}`)).toBe('reserved_name');
    });

    it.each(['CON.md', 'nul.txt', 'com1.tar.gz', 'LPT3.json', 'aux.'])(
      'rejects the reserved name with an extension %j',
      (name) => {
        // 'aux.' 同时以点结尾，哪个原因先命中都可以，只要被拒绝。
        expect(reasonOf(name)).not.toBeNull();
      },
    );

    it.each(['<', '>', ':', '"', '|', '?', '*'])(
      'rejects the character %j',
      (char) => {
        expect(reasonOf(`notes/a${char}b.md`)).toBe('reserved_character');
      },
    );

    it.each(['\u0000', '\u0001', '\u001f', '\n', '\t', '\u007f'])(
      'rejects the control character %j',
      (char) => {
        expect(reasonOf(`notes/a${char}b.md`)).toBe('control_character');
      },
    );

    it.each(['notes.', 'notes/a.', 'a /b', 'notes/a ', 'a.md '])(
      'rejects the segment ending with a dot or a space in %j',
      (path) => {
        expect(reasonOf(path)).toBe('trailing_dot_or_space');
      },
    );
  });

  it('rejects the temp file prefix (reserved for atomic writes)', () => {
    expect(reasonOf(`concepts/${TEMP_FILE_PREFIX}x`)).toBe('temp_file_name');
  });

  it.each([42, null, undefined])('rejects %j as not a string', (path) => {
    expect(reasonOf(path as unknown as string)).toBe('not_a_string');
  });

  it('carries the original path in the error params', () => {
    try {
      normalizePath('../x');
      expect.unreachable();
    } catch (error) {
      expect((error as PlatformError).params).toEqual({
        path: '../x',
        reason: 'dot_segment',
      });
    }
  });
});

describe('path helpers', () => {
  it('joins a directory and a name', () => {
    expect(joinPath('', 'a.md')).toBe('a.md');
    expect(joinPath('concepts', 'a.md')).toBe('concepts/a.md');
  });

  it('returns the parent directory', () => {
    expect(parentPath('a.md')).toBe('');
    expect(parentPath('concepts/a.md')).toBe('concepts');
    expect(parentPath('a/b/c')).toBe('a/b');
  });

  it('returns the last segment', () => {
    expect(baseName('a.md')).toBe('a.md');
    expect(baseName('concepts/a.md')).toBe('a.md');
  });

  it('recognizes temp file names', () => {
    expect(
      isTempFileName(`${TEMP_FILE_PREFIX}01JD3K8Q8Z6V7X2N4M5P9R0T1W`),
    ).toBe(true);
    expect(isTempFileName('a.md')).toBe(false);
  });
});
