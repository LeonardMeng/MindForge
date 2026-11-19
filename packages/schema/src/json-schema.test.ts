// 导出的 JSON Schema 带上了 .meta() 补的约束，并且这些约束和 zod 的 .check() 用的是同一份定义。
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  AssessmentSession,
  ConceptFrontmatter,
  Criteria,
  DimensionScores,
  Evidence,
  GlobalConceptRef,
  IsoDateTime,
  MasteryHistoryEntry,
  MasteryProjection,
  Blindspot,
  Intervention,
  Proposal,
  ProjectConfig,
  Slug,
  Ulid,
  WorkspaceConfig,
} from './index.js';
import { codesOf } from './test-helpers.js';

const FILE_SCHEMAS = {
  WorkspaceConfig,
  ProjectConfig,
  ConceptFrontmatter,
  Criteria,
  AssessmentSession,
  Evidence,
  MasteryProjection,
  MasteryHistoryEntry,
  Blindspot,
  Intervention,
  Proposal,
};

/** 按输出端导出 JSON Schema（列表字段是 pipe，输出端才是数组）。 */
const jsonSchemaOf = (schema: z.ZodType): unknown =>
  z.toJSONSchema(schema, { io: 'output' });

/** 沿着路径取 JSON Schema 里的一个节点。 */
function at(node: unknown, ...path: (string | number)[]): unknown {
  let current = node;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

/** 取出 JSON Schema 里的 pattern 并编译成正则。 */
function patternOf(node: unknown): RegExp {
  const pattern = at(node, 'pattern');
  if (typeof pattern !== 'string') throw new Error('no pattern');
  return new RegExp(pattern);
}

/**
 * 对照：JSON Schema 里的正则和 zod 对同一批“只看格式”的样例给出相同的结论。
 * （长度、日期是否真实存在等由其他关键字或说明页处理，不在这里比较。）
 */
function expectSameVerdicts(
  schema: z.ZodType,
  pattern: RegExp,
  samples: string[],
) {
  for (const sample of samples) {
    expect(pattern.test(sample), sample).toBe(
      codesOf(schema, sample).length === 0,
    );
  }
}

describe('JSON Schema export', () => {
  it.each(Object.entries(FILE_SCHEMAS))(
    'exports %s as draft 2020-12',
    (_name, schema) => {
      expect(at(jsonSchemaOf(schema), '$schema')).toBe(
        'https://json-schema.org/draft/2020-12/schema',
      );
    },
  );

  describe('identifiers and timestamps', () => {
    it('Slug carries its pattern and maximum length', () => {
      const node = jsonSchemaOf(Slug);
      expect(node).toMatchObject({ type: 'string', maxLength: 64 });
      expectSameVerdicts(Slug, patternOf(node), [
        'a',
        'self-attention',
        '3d-geometry',
        '',
        'Self',
        'self_attention',
        '-a',
        'a-',
        'a--b',
        'ai:x',
      ]);
    });

    it('GlobalConceptRef carries its pattern', () => {
      expectSameVerdicts(
        GlobalConceptRef,
        patternOf(jsonSchemaOf(GlobalConceptRef)),
        [
          'ai:self-attention',
          'a:b',
          'self-attention',
          'ai::x',
          'AI:x',
          'ai:x:y',
          ':x',
          'ai:',
        ],
      );
    });

    it('Ulid carries the full canonical pattern', () => {
      expectSameVerdicts(Ulid, patternOf(jsonSchemaOf(Ulid)), [
        '01JD3K8Q8Z6V7X2N4M5P9R0T1W',
        '7ZZZZZZZZZZZZZZZZZZZZZZZZZ',
        '01jd3k8q8z6v7x2n4m5p9r0t1w',
        '01JD3K8Q8Z6V7X2N4M5P9R0T1',
        '01JD3K8Q8Z6V7X2N4M5P9R0T1I',
        '8ZZZZZZZZZZZZZZZZZZZZZZZZZ',
      ]);
    });

    it('IsoDateTime carries the single allowed format', () => {
      // 只比较格式；2 月 30 日这类“格式对但日期不存在”的情况只有 zod 能发现，写在说明页里。
      expectSameVerdicts(IsoDateTime, patternOf(jsonSchemaOf(IsoDateTime)), [
        '2026-11-19T10:00:00Z',
        '2026-11-19T10:00:00.000Z',
        '2026-11-19T10:00:00+11:00',
        '2026-11-19',
        '2026-11-19 10:00:00Z',
      ]);
    });
  });

  describe('numbers', () => {
    it('dimension scores are 0..1 or null, with all five required', () => {
      const node = jsonSchemaOf(DimensionScores);
      expect(at(node, 'required')).toEqual([
        'recall',
        'understanding',
        'reasoning',
        'application',
        'transfer',
      ]);
      expect(at(node, 'additionalProperties')).toBe(false);
      expect(at(node, 'properties', 'recall', 'anyOf')).toEqual([
        { type: 'number', minimum: 0, maximum: 1 },
        { type: 'null' },
      ]);
    });

    it('positive integers and 0..1 values carry their ranges', () => {
      const node = jsonSchemaOf(Evidence);
      expect(at(node, 'properties', 'criteria_version')).toMatchObject({
        type: 'integer',
        minimum: 1,
      });
      expect(at(node, 'properties', 'confidence')).toMatchObject({
        type: 'number',
        minimum: 0,
        maximum: 1,
      });
    });
  });

  describe('strings and lists', () => {
    it('non-empty strings must contain a non-whitespace character', () => {
      const pattern = patternOf(
        at(jsonSchemaOf(ProjectConfig), 'properties', 'name'),
      );
      expect(pattern.test('Softmax')).toBe(true);
      expect(pattern.test('')).toBe(false);
      expect(pattern.test('   ')).toBe(false);
    });

    it('lists carry minItems and uniqueItems', () => {
      expect(
        at(
          jsonSchemaOf(Criteria),
          'properties',
          'dimensions',
          'properties',
          'recall',
          'anyOf',
          0,
          'properties',
          'focus',
        ),
      ).toMatchObject({ type: 'array', minItems: 1, uniqueItems: true });
      expect(
        at(jsonSchemaOf(ConceptFrontmatter), 'properties', 'prerequisites'),
      ).toMatchObject({
        type: 'array',
        uniqueItems: true,
      });
      expect(
        at(
          jsonSchemaOf(ConceptFrontmatter),
          'properties',
          'prerequisites',
          'minItems',
        ),
      ).toBeUndefined();
      // 评测会话的题目允许重复，只要求不为空。
      const items = at(jsonSchemaOf(AssessmentSession), 'properties', 'items');
      expect(items).toMatchObject({ type: 'array', minItems: 1 });
      expect(at(items, 'uniqueItems')).toBeUndefined();
    });
  });

  describe('objects', () => {
    it('file schemas are strict, except the Concept frontmatter', () => {
      expect(at(jsonSchemaOf(Evidence), 'additionalProperties')).toBe(false);
      expect(
        at(jsonSchemaOf(ConceptFrontmatter), 'additionalProperties'),
      ).not.toBe(false);
    });

    it('plugin names carry their pattern and configs must be objects', () => {
      const plugins = at(
        jsonSchemaOf(WorkspaceConfig),
        'properties',
        'plugins',
      );
      const pattern = patternOf(at(plugins, 'propertyNames'));
      for (const name of ['agent-teacher', '~agent-research']) {
        expect(pattern.test(name), name).toBe(true);
      }
      for (const name of [
        'Agent',
        'agent_x',
        '~',
        '~~agent',
        '@someone/agent-x',
      ]) {
        expect(pattern.test(name), name).toBe(false);
      }
      expect(at(plugins, 'additionalProperties', 'type')).toBe('object');
    });

    it('model references and explanation codes carry their patterns', () => {
      const evaluator = at(
        jsonSchemaOf(Evidence),
        'properties',
        'evaluator',
        'oneOf',
        0,
      );
      const model = patternOf(at(evaluator, 'properties', 'model'));
      expect(model.test('ollama:qwen3-14b')).toBe(true);
      expect(model.test('qwen3')).toBe(false);
      const code = patternOf(
        at(
          jsonSchemaOf(MasteryProjection),
          'properties',
          'explanation',
          'items',
          'properties',
          'code',
        ),
      );
      expect(code.test('state.mastered')).toBe(true);
      expect(code.test('State.Mastered')).toBe(false);
    });

    it('tagged objects become oneOf with a const discriminator', () => {
      const operations = at(jsonSchemaOf(Proposal), 'properties', 'operations');
      expect(operations).toMatchObject({ type: 'array', minItems: 1 });
      const variants = at(operations, 'items', 'oneOf');
      expect(Array.isArray(variants) ? variants.length : 0).toBe(8);
    });
  });
});
