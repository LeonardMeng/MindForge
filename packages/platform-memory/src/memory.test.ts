import {
  describeClockContract,
  describeFileSystemContract,
  describeIdGeneratorContract,
  describeLockContract,
} from '@mastery/platform/contract';
import { describe, expect, it } from 'vitest';

import {
  createMemoryPlatform,
  FakeClock,
  MemoryFileSystem,
  MemoryIdGenerator,
  MemoryLockSpace,
  SimulatedCrashError,
} from './index.js';

// ── 契约测试：内存实现必须和 Node、Tauri 实现通过同一套测试 ──────────────────
describeFileSystemContract('memory', () => {
  const clock = new FakeClock('2026-11-20T08:00:00Z');
  const fs = new MemoryFileSystem({ clock });
  return { fs, leaveTempFile: (dir, ageMs) => fs.leaveTempFile(dir, ageMs) };
});
describeClockContract('memory', () => new FakeClock());
describeIdGeneratorContract(
  'memory',
  () => new MemoryIdGenerator(new FakeClock()),
);
describeLockContract('memory', () => {
  const space = new MemoryLockSpace();
  return { first: space.lock(), second: space.lock() };
});

// ── 只有内存实现才有的能力 ────────────────────────────────────────────────
describe('MemoryFileSystem crash simulation', () => {
  it('keeps the old content when a write crashes half way', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeTextFile('a.md', 'old content');
    fs.crashOnNextWrite();
    await expect(
      fs.writeTextFile('a.md', 'new content'),
    ).rejects.toBeInstanceOf(SimulatedCrashError);
    expect(await fs.readTextFile('a.md')).toBe('old content');
  });

  it('creates nothing at the target when the first write of a file crashes', async () => {
    const fs = new MemoryFileSystem();
    fs.crashOnNextWrite();
    await expect(fs.writeTextFile('a.md', 'content')).rejects.toBeInstanceOf(
      SimulatedCrashError,
    );
    expect(await fs.stat('a.md')).toBeNull();
    expect(await fs.list('')).toEqual([]);
  });

  it('leaves a half-written temp file, like a real crash', async () => {
    const clock = new FakeClock('2026-11-20T08:00:00Z');
    const fs = new MemoryFileSystem({ clock });
    fs.crashOnNextWrite();
    await expect(fs.writeTextFile('a.md', 'content')).rejects.toBeInstanceOf(
      SimulatedCrashError,
    );
    clock.advance(11 * 60 * 1000);
    const removed = await fs.cleanupTempFiles('');
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatch(/^\.mastery-tmp-/);
  });

  it('creates nothing when an exclusive create crashes half way', async () => {
    const fs = new MemoryFileSystem();
    fs.crashOnNextWrite();
    await expect(fs.createTextFile('a.md', 'content')).rejects.toBeInstanceOf(
      SimulatedCrashError,
    );
    expect(await fs.stat('a.md')).toBeNull();
    await fs.createTextFile('a.md', 'again');
    expect(await fs.readTextFile('a.md')).toBe('again');
  });

  it('only crashes the next write', async () => {
    const fs = new MemoryFileSystem();
    fs.crashOnNextWrite();
    await expect(fs.writeTextFile('a.md', 'x')).rejects.toBeInstanceOf(
      SimulatedCrashError,
    );
    await fs.writeTextFile('a.md', 'y');
    expect(await fs.readTextFile('a.md')).toBe('y');
  });
});

describe('FakeClock', () => {
  it('starts at the given time and can be set and advanced', () => {
    const clock = new FakeClock('2026-11-20T08:00:00Z');
    expect(clock.now()).toBe('2026-11-20T08:00:00Z');
    clock.advance(90_500);
    expect(clock.now()).toBe('2026-11-20T08:01:30Z');
    clock.set('2027-01-01T00:00:00Z');
    expect(clock.now()).toBe('2027-01-01T00:00:00Z');
  });

  it('rejects an invalid time', () => {
    expect(() => new FakeClock('2026-11-20T08:00:00.000Z')).toThrow();
  });
});

describe('MemoryIdGenerator', () => {
  it('is deterministic for the same clock', () => {
    const a = new MemoryIdGenerator(new FakeClock('2026-11-20T08:00:00Z'));
    const b = new MemoryIdGenerator(new FakeClock('2026-11-20T08:00:00Z'));
    expect([a.ulid(), a.ulid()]).toEqual([b.ulid(), b.ulid()]);
  });

  it('encodes the clock time in the ULID', () => {
    const clock = new FakeClock('2026-11-20T08:00:00Z');
    const ids = new MemoryIdGenerator(clock);
    const first = ids.ulid();
    clock.advance(1000);
    const later = ids.ulid();
    expect(later.slice(0, 10) > first.slice(0, 10)).toBe(true);
  });

  it('stays increasing when the clock is set back', () => {
    const clock = new FakeClock('2026-11-20T08:00:00Z');
    const ids = new MemoryIdGenerator(clock);
    const first = ids.ulid();
    clock.set('2020-01-01T00:00:00Z');
    expect(ids.ulid() > first).toBe(true);
  });
});

describe('createMemoryPlatform', () => {
  it('wires the clock into the file system and the id generator', async () => {
    const platform = createMemoryPlatform({ now: '2026-11-20T08:00:00Z' });
    await platform.fs.writeTextFile('a.md', 'x');
    expect((await platform.fs.stat('a.md'))?.modifiedAtMs).toBe(
      Date.parse('2026-11-20T08:00:00Z'),
    );
    expect(platform.clock.now()).toBe('2026-11-20T08:00:00Z');
    expect(platform.ids.ulid()).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  });
});
