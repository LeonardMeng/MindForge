import { describe, expect, it } from 'vitest';

import { describeRepositoryContract } from './contract/index.js';
import {
  CORE_ERROR_CODES,
  coreError,
  err,
  ok,
  publish,
  type DomainEvent,
  type Result,
} from './index.js';
import {
  createEventRecorder,
  createMemoryRepository,
  createRulesRegistry,
} from './testing/index.js';

describeRepositoryContract('memory (core/testing)', () =>
  createMemoryRepository(),
);

const EVENT: DomainEvent = {
  type: 'evidence/submitted',
  conceptId: 'softmax' as never,
  evidenceId: '01JD3K8Q8Z6V7X2N4M5P9R0T1A' as never,
  at: '2026-11-20T08:00:00Z' as never,
};

describe('publish: a listener error never changes the operation', () => {
  it('delivers the event', () => {
    const sink = createEventRecorder();
    publish(sink, EVENT);
    expect(sink.events).toEqual([EVENT]);
    expect(sink.errors).toEqual([]);
  });

  it('catches an error thrown by the listener and reports it', () => {
    const failure = new Error('listener broke');
    const sink = createEventRecorder(() => {
      throw failure;
    });
    expect(() => publish(sink, EVENT)).not.toThrow();
    expect(sink.errors).toEqual([{ error: failure, event: EVENT }]);
  });

  it('ignores an error thrown while reporting', () => {
    const sink = {
      emit: () => {
        throw new Error('listener broke');
      },
      reportError: () => {
        throw new Error('reporter broke too');
      },
    };
    expect(() => publish(sink, EVENT)).not.toThrow();
  });
});

describe('domain errors', () => {
  it('builds every message from the message table', () => {
    const params = {
      concept_id: 'softmax',
      expected: 2,
      actual: 1,
      session_id: 'S',
      field: 'concept_id',
      evidence_id: 'E',
      version: 3,
      count: 1,
    };
    for (const code of CORE_ERROR_CODES) {
      const error = coreError(code, params);
      expect(error.code).toBe(code);
      expect(error.message.length).toBeGreaterThan(0);
      expect(error.message).not.toContain('undefined');
      expect(error.issues).toEqual([]);
    }
  });

  it('are plain data, so they can be serialized and compared', () => {
    const error = coreError('core.criteria_version_mismatch', {
      concept_id: 'softmax',
      expected: 2,
      actual: 1,
    });
    expect(JSON.parse(JSON.stringify(error))).toEqual(error);
  });
});

describe('Result', () => {
  it('is ok or err', () => {
    const results: Result<number, string>[] = [ok(1), err('no')];
    expect(results).toEqual([
      { ok: true, value: 1 },
      { ok: false, error: 'no' },
    ]);
  });
});

describe('createRulesRegistry', () => {
  it('returns rules by version, and the newest as current', () => {
    const registry = createRulesRegistry([{ version: 1 }, { version: 2 }]);
    expect(registry.get(1)).toEqual({ version: 1 });
    expect(registry.get(3)).toBeNull();
    expect(registry.current()).toEqual({ version: 2 });
  });
});
