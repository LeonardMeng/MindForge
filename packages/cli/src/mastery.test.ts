/**
 * 2.8 的验收：在 fixture 的副本上走通完整流程（真实磁盘的临时目录，假时钟和确定的 ID）。
 */
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FakeClock, MemoryIdGenerator } from '@mastery/platform-memory';
import { afterAll, describe, expect, it } from 'vitest';

import { EXIT, run } from './index.js';

const FIXTURE = join(import.meta.dirname, '../../../fixtures/ws-transformers');
const created: string[] = [];

afterAll(async () => {
  await Promise.all(
    created.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

/** fixture 的一份副本，以及在里面运行 `mastery` 的函数。 */
async function workspace(start = '2026-11-19T10:00:00Z') {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'mastery-cli-28-')));
  created.push(home);
  const root = join(home, 'ws');
  await cp(FIXTURE, root, { recursive: true });
  const clock = new FakeClock(start);
  const ids = new MemoryIdGenerator(clock);
  let stdin = '';
  const mastery = async (...argv: string[]) => {
    let stdout = '';
    let stderr = '';
    const code = await run(argv, {
      home,
      deviceDir: join(home, '.mastery'),
      cwd: root,
      stdout: { write: (text) => (stdout += text) },
      stderr: { write: (text) => (stderr += text) },
      hostname: 'test-laptop',
      username: 'tester',
      locale: 'en',
      platform: process.platform,
      clock,
      ids,
      readStdin: () => Promise.resolve(stdin),
    });
    return { code, stdout, stderr };
  };
  return {
    home,
    root,
    clock,
    mastery,
    setStdin: (text: string) => {
      stdin = text;
    },
    files: async () => {
      const result: Record<string, string> = {};
      for (const entry of await readdir(root, {
        recursive: true,
        withFileTypes: true,
      })) {
        if (!entry.isFile()) continue;
        const path = join(entry.parentPath, entry.name);
        result[
          path
            .slice(root.length + 1)
            .split('\\')
            .join('/')
        ] = await readFile(path, 'utf8');
      }
      return result;
    },
  };
}

const json = <T>(text: string) => JSON.parse(text) as T;

/** self-attention 的第二次独立验证（criteria v2），由 agent 给出；文件里没有 id 和 created_at。 */
const SECOND_VERIFICATION = {
  schema_version: 1,
  concept_id: 'self-attention',
  session_id: null,
  assessment_type: 'independent_verification',
  criteria_version: 2,
  dimensions: {
    recall: 0.9,
    understanding: 0.8,
    reasoning: 0.8,
    application: 0.7,
    transfer: null,
  },
  confidence: 0.85,
  evaluator: {
    kind: 'agent',
    id: 'agent-evaluator',
    model: 'ollama:qwen3-14b',
  },
  note: 'oral exam, graded by the evaluator agent',
};

describe('evidence → recompute → status → due on a copy of the fixture', () => {
  it('works end to end', async () => {
    const ws = await workspace();

    // 1. fixture 是合法的，没有警告。
    const validated = await ws.mastery('validate', ws.root);
    expect(validated.code).toBe(EXIT.ok);
    expect(validated.stdout).toBe('0 errors, 0 warnings\n');
    expect(validated.stderr).toBe('');

    // 2. 还没重算：有证据的 Concept 标成 stale。
    const before = await ws.mastery('status');
    expect(before.code).toBe(EXIT.ok);
    expect(before.stdout).toMatch(/self-attention\s+not_assessed.*stale/);
    expect(before.stdout).toMatch(/multi-head-attention\s+not_assessed.*stale/);

    // 3. 重算所有有评测标准的 Concept。
    const recomputed = await ws.mastery('recompute', '--json');
    expect(recomputed.code).toBe(EXIT.ok);
    expect(json<{ concepts: unknown[] }>(recomputed.stdout).concepts).toEqual([
      { concept: 'embedding', outcome: 'skipped', state: null },
      { concept: 'layer-normalization', outcome: 'skipped', state: null },
      { concept: 'matrix-multiplication', outcome: 'skipped', state: null },
      {
        concept: 'multi-head-attention',
        outcome: 'changed',
        state: 'learning',
      },
      { concept: 'positional-encoding', outcome: 'skipped', state: null },
      { concept: 'probability', outcome: 'skipped', state: null },
      { concept: 'residual-connection', outcome: 'skipped', state: null },
      {
        concept: 'self-attention',
        outcome: 'changed',
        state: 'provisional_mastery',
      },
      { concept: 'softmax', outcome: 'unchanged', state: null },
      { concept: 'transformer', outcome: 'skipped', state: null },
    ]);
    const afterRecompute = await ws.files();
    expect(
      Object.keys(afterRecompute)
        .filter((f) => f.startsWith('mastery/'))
        .sort(),
    ).toEqual([
      'mastery/history/multi-head-attention.jsonl',
      'mastery/history/self-attention.jsonl',
      'mastery/multi-head-attention.yaml',
      'mastery/self-attention.yaml',
    ]);

    // 再算一次什么都不写。
    const again = await ws.mastery('recompute');
    expect(again.code).toBe(EXIT.ok);
    expect(again.stdout).toMatch(
      /self-attention\s+unchanged\s+provisional_mastery/,
    );
    expect(await ws.files()).toEqual(afterRecompute);

    // 4. status：表格里没测过的是 —，不是 0；不再 stale。
    const table = await ws.mastery('status');
    expect(table.stdout).toMatch(
      /self-attention\s+provisional_mastery\s+0\.83\s+0\.74\s+0\.75\s+0\.67\s+—\s+0\.47/,
    );
    expect(table.stdout).not.toContain('stale');
    const detail = await ws.mastery('status', 'self-attention');
    expect(detail.code).toBe(EXIT.ok);
    expect(detail.stdout).toContain('self-attention: provisional_mastery');
    expect(detail.stdout).toMatch(/transfer\s+—\s+not assessed/);
    expect(detail.stdout).toContain(
      '- 1 of 2 passing independent verification(s)',
    );
    expect(detail.stdout).toContain(
      '- probability (via softmax): not_assessed',
    );

    // 5. evidence add 从 JSON 文件（没有 id 和 created_at）：第二次独立验证，相隔 7 天，变成 mastered。
    const file = join(ws.home, 'second.json');
    await writeFile(file, JSON.stringify(SECOND_VERIFICATION));
    const added = await ws.mastery('evidence', 'add', file);
    expect(added.code).toBe(EXIT.ok);
    expect(added.stdout).toMatch(
      /^saved evidence [0-9A-Z]{26} for self-attention\nself-attention: mastered\n$/,
    );
    expect(added.stderr).toBe('');
    const mastered = json<{
      state: string;
      review_due_at: string;
      explanation: { text: string }[];
    }>((await ws.mastery('status', 'self-attention', '--json')).stdout);
    expect(mastered).toMatchObject({
      state: 'mastered',
      review_due_at: '2026-11-26T10:00:00Z',
    });

    // 6. evidence add 从命令行参数：练习。
    ws.clock.set('2026-11-20T09:00:00Z');
    const practice = await ws.mastery(
      'evidence',
      'add',
      '--concept',
      'multi-head-attention',
      '--type',
      'practice',
      '--understanding',
      '0.75',
      '--application',
      '0.7',
      '--confidence',
      '0.8',
      '--note',
      'exercise sheet 3',
    );
    expect(practice.code).toBe(EXIT.ok);
    expect(practice.stderr).toBe('');
    const saved = Object.keys(await ws.files()).filter((f) =>
      f.startsWith('evidence/multi-head-attention/'),
    );
    expect(saved).toHaveLength(3);

    // 7. due：到期前什么都没有；--within 列出即将到期的；到期后列出。
    expect((await ws.mastery('due')).stdout).toBe('nothing to review\n');
    expect((await ws.mastery('due', '--within', '7')).stdout).toMatch(
      /2026-11-26\s+self-attention\s+coming up/,
    );
    ws.clock.set('2026-11-26T10:00:00Z');
    const due = await ws.mastery('due', '--json');
    expect(json<{ concepts: unknown[] }>(due.stdout).concepts).toEqual([
      {
        concept: 'self-attention',
        reason: 'due',
        review_due_at: '2026-11-26T10:00:00Z',
      },
    ]);
    expect((await ws.mastery('status')).stdout).toMatch(
      /self-attention\s+needs_review \(due\)/,
    );
    // 到期只在读取时推导，文件不变。
    const beforeRead = await ws.files();
    await ws.mastery('status', 'self-attention');
    expect(await ws.files()).toEqual(beforeRead);
  });
});

describe('evidence add', () => {
  it('a self-reported independent verification is accepted with a notice', async () => {
    const ws = await workspace();
    const result = await ws.mastery(
      'evidence',
      'add',
      '--concept',
      'multi-head-attention',
      '--type',
      'independent_verification',
      '--understanding',
      '0.8',
      '--application',
      '0.75',
      '--transfer',
      '0.6',
      '--confidence',
      '0.9',
      '--note',
      'final exam, question 4',
    );
    expect(result.code).toBe(EXIT.ok);
    expect(result.stderr).toMatch(
      /^notice: this independent verification was entered by hand/,
    );
  });

  it('the notice also applies to JSON with evaluator human and no session', async () => {
    const ws = await workspace();
    ws.setStdin(
      JSON.stringify({ ...SECOND_VERIFICATION, evaluator: { kind: 'human' } }),
    );
    const result = await ws.mastery('evidence', 'add', '-', '--json');
    expect(result.code).toBe(EXIT.ok);
    expect(json(result.stdout)).toMatchObject({
      saved: true,
      self_reported: true,
      recompute: { ok: true },
    });
  });

  it('refused evidence: exit 1 and nothing is written', async () => {
    const ws = await workspace();
    const before = await ws.files();
    const result = await ws.mastery(
      'evidence',
      'add',
      '--concept',
      'self-attention',
      '--type',
      'practice',
      '--recall',
      '1.5',
      '--confidence',
      '0.8',
      '--note',
      'x',
    );
    expect(result.code).toBe(EXIT.failed);
    expect(result.stderr).toContain('core.evidence_invalid');
    expect(await ws.files()).toEqual(before);
  });

  it('a concept without criteria is refused', async () => {
    const ws = await workspace();
    const result = await ws.mastery(
      'evidence',
      'add',
      '--concept',
      'probability',
      '--type',
      'practice',
      '--recall',
      '0.5',
      '--confidence',
      '0.8',
      '--note',
      'x',
    );
    expect(result.code).toBe(EXIT.failed);
    expect(result.stderr).toContain('core.criteria_not_found');
  });

  it('saved but recompute failed: exit 3 with the evidence id, and the evidence is on disk', async () => {
    const ws = await workspace();
    // 另一条更新版本写的证据：新证据照样能保存，但重算必须拒绝。
    await writeFile(
      join(
        ws.root,
        'evidence/multi-head-attention/01JCZ9N0P1Q2R3S4T5V6W7X8Y9.json',
      ),
      JSON.stringify({ schema_version: 99, id: '01JCZ9N0P1Q2R3S4T5V6W7X8Y9' }),
    );
    const result = await ws.mastery(
      'evidence',
      'add',
      '--concept',
      'multi-head-attention',
      '--type',
      'practice',
      '--understanding',
      '0.7',
      '--confidence',
      '0.8',
      '--note',
      'x',
    );
    expect(result.code).toBe(EXIT.savedNotRecomputed);
    const id = /saved evidence ([0-9A-Z]{26})/.exec(result.stdout)?.[1];
    expect(id).toBeDefined();
    expect(result.stderr).toContain(`evidence ${id ?? ''} was saved`);
    expect(result.stderr).toContain('Do not add it again');
    expect(result.stderr).toContain('core.evidence_version_too_new');
    expect(Object.keys(await ws.files())).toContain(
      `evidence/multi-head-attention/${id ?? ''}.json`,
    );
  });

  it('the --json output of exit 3 says saved: true', async () => {
    const ws = await workspace();
    await writeFile(
      join(
        ws.root,
        'evidence/multi-head-attention/01JCZ9N0P1Q2R3S4T5V6W7X8Y9.json',
      ),
      JSON.stringify({ schema_version: 99 }),
    );
    const result = await ws.mastery(
      'evidence',
      'add',
      '--concept',
      'multi-head-attention',
      '--type',
      'practice',
      '--understanding',
      '0.7',
      '--confidence',
      '0.8',
      '--note',
      'x',
      '--json',
    );
    expect(result.code).toBe(EXIT.savedNotRecomputed);
    expect(json(result.stdout)).toMatchObject({
      saved: true,
      recompute: { ok: false },
    });
  });

  it('usage errors: a file and flags together, a missing option, a bad number', async () => {
    const ws = await workspace();
    expect(
      (await ws.mastery('evidence', 'add', 'x.json', '--concept', 'softmax'))
        .code,
    ).toBe(EXIT.usage);
    expect(
      (
        await ws.mastery(
          'evidence',
          'add',
          '--type',
          'practice',
          '--confidence',
          '1',
        )
      ).code,
    ).toBe(EXIT.usage);
    expect(
      (
        await ws.mastery(
          'evidence',
          'add',
          '--concept',
          'softmax',
          '--type',
          'practice',
          '--confidence',
          'high',
        )
      ).code,
    ).toBe(EXIT.usage);
    expect((await ws.mastery('evidence', 'remove')).code).toBe(EXIT.usage);
  });

  it('a file that is not JSON is an error, and nothing is written', async () => {
    const ws = await workspace();
    const file = join(ws.home, 'bad.json');
    await writeFile(file, '{');
    const before = await ws.files();
    const result = await ws.mastery('evidence', 'add', file);
    expect(result.code).toBe(EXIT.failed);
    expect(result.stderr).toContain('is not valid JSON');
    expect(await ws.files()).toEqual(before);
  });
});

describe('finding the workspace', () => {
  it('searches upwards from the current folder, or uses --workspace', async () => {
    const ws = await workspace();
    expect((await ws.mastery('status', '--workspace', ws.root)).code).toBe(
      EXIT.ok,
    );
    expect(
      (await ws.mastery('status', '--workspace', ws.home)).stderr,
    ).toContain('is not a workspace');
  });

  it('reports when there is no workspace', async () => {
    const home = await realpath(
      await mkdtemp(join(tmpdir(), 'mastery-cli-28-')),
    );
    created.push(home);
    let stderr = '';
    const code = await run(['status'], {
      home,
      deviceDir: join(home, '.mastery'),
      cwd: home,
      stdout: { write: () => undefined },
      stderr: { write: (text) => (stderr += text) },
      hostname: 'h',
      username: 'u',
      locale: 'en',
      platform: process.platform,
    });
    expect(code).toBe(EXIT.failed);
    expect(stderr).toContain('no workspace found');
  });
});

describe('status and due details', () => {
  it('marks a projection computed by other rules as stale', async () => {
    const ws = await workspace();
    await ws.mastery('recompute');
    const path = join(ws.root, 'mastery/self-attention.yaml');
    await writeFile(
      path,
      (await readFile(path, 'utf8')).replace(
        'rules_version: 1',
        'rules_version: 2',
      ),
    );
    expect((await ws.mastery('status')).stdout).toMatch(
      /self-attention\s+provisional_mastery.*stale/,
    );
  });

  it('due lists a regression (stored needs_review) first', async () => {
    const ws = await workspace();
    await writeFile(
      join(ws.home, 'second.json'),
      JSON.stringify(SECOND_VERIFICATION),
    );
    await ws.mastery('evidence', 'add', join(ws.home, 'second.json'));
    ws.clock.set('2026-11-20T10:00:00Z');
    await ws.mastery(
      'evidence',
      'add',
      '--concept',
      'self-attention',
      '--type',
      'practice',
      '--recall',
      '0.1',
      '--application',
      '0.1',
      '--confidence',
      '1',
      '--note',
      'forgot everything',
    );
    const result = await ws.mastery('due');
    expect(result.stdout).toMatch(
      /—\s+self-attention\s+needs review \(latest evidence fell short\)/,
    );
  });

  it('status of a missing concept is an error', async () => {
    const ws = await workspace();
    const result = await ws.mastery('status', 'ghost');
    expect(result.code).toBe(EXIT.failed);
    expect(result.stderr).toContain('concept "ghost" does not exist');
  });

  it('--within must be a whole number', async () => {
    const ws = await workspace();
    expect((await ws.mastery('due', '--within', 'soon')).code).toBe(EXIT.usage);
  });

  it('recompute of one concept without criteria is an error', async () => {
    const ws = await workspace();
    const result = await ws.mastery('recompute', 'probability');
    expect(result.code).toBe(EXIT.failed);
    expect(result.stderr).toContain('core.criteria_not_found');
  });

  it('the help lists the exit codes, including 3', async () => {
    const ws = await workspace();
    const help = (await ws.mastery('--help')).stdout;
    expect(help).toContain(
      '3  the evidence was saved, but recomputing its concept failed',
    );
    expect(help).toContain('evidence add [file]');
  });
});
