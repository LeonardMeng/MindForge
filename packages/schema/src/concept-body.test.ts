import { describe, expect, it } from 'vitest';

import { parseConceptBody } from './index.js';

/** README 第 7 节 Concept 示例的正文。 */
const README_BODY = `
# Self-Attention

## Description
计算序列中各个 token 之间关系的机制。

## Learning Objectives
- 解释 Query、Key、Value。
- 解释注意力分数是怎么算出来的。
- 解释 softmax 的作用。
`;

const warningsOf = (body: string) =>
  parseConceptBody(body).warnings.map((w) => [w.code, w.params.section]);

describe('parseConceptBody', () => {
  it('parses the README example', () => {
    expect(parseConceptBody(README_BODY)).toEqual({
      description: '计算序列中各个 token 之间关系的机制。',
      learningObjectives: [
        '解释 Query、Key、Value。',
        '解释注意力分数是怎么算出来的。',
        '解释 softmax 的作用。',
      ],
      warnings: [],
    });
  });

  it('keeps paragraphs and sub-headings, trimming blank lines around the section', () => {
    const body = [
      '## Description',
      '',
      '第一段。',
      '',
      '### 直觉',
      '第二段。',
      '',
      '',
      '## Learning Objectives',
      '- 目标',
    ].join('\n');
    expect(parseConceptBody(body).description).toBe(
      '第一段。\n\n### 直觉\n第二段。',
    );
  });

  it('takes top-level -, *, + and numbered items; ignores nested content and other lines', () => {
    const body = [
      '## Description',
      'd',
      '## Learning Objectives',
      '先看这几个：',
      '- 用 dash',
      '* 用 star',
      '+ 用 plus',
      '1. 用数字',
      '2) 也用数字',
      '  - 嵌套的不算',
      '    续行也不算',
      '-',
    ].join('\n');
    expect(parseConceptBody(body).learningObjectives).toEqual([
      '用 dash',
      '用 star',
      '用 plus',
      '用数字',
      '也用数字',
    ]);
  });

  it('ignores other sections and ends a section at the next level-1 or level-2 heading', () => {
    const body = [
      '## Description',
      'd',
      '## Notes',
      '- 不是目标',
      '## Learning Objectives',
      '- 目标',
      '# Appendix',
      '- 也不是目标',
    ].join('\n');
    expect(parseConceptBody(body)).toEqual({
      description: 'd',
      learningObjectives: ['目标'],
      warnings: [],
    });
  });

  it.each(['```', '~~~', '````'])(
    'ignores headings inside %s code blocks',
    (fence) => {
      const body = [
        '## Description',
        fence,
        '## Learning Objectives',
        '- 代码里的不算',
        fence,
        '## Learning Objectives',
        '- 真正的目标',
      ].join('\n');
      expect(parseConceptBody(body)).toEqual({
        description: `${fence}\n## Learning Objectives\n- 代码里的不算\n${fence}`,
        learningObjectives: ['真正的目标'],
        warnings: [],
      });
    },
  );

  it('closes a fence only with the same character and at least the same length', () => {
    const body = [
      '## Description',
      '````',
      '```',
      '~~~~',
      '## Learning Objectives',
      '````',
      '## Learning Objectives',
      '- 目标',
    ].join('\n');
    expect(parseConceptBody(body).learningObjectives).toEqual(['目标']);
  });

  it('only recognises the exact English level-2 headings', () => {
    const body = [
      '## description',
      '### Description',
      '## 描述',
      '## Learning objectives',
    ].join('\n');
    expect(parseConceptBody(body)).toMatchObject({
      description: null,
      learningObjectives: null,
    });
  });

  it('allows trailing spaces after a heading', () => {
    expect(parseConceptBody('## Description   \nd').description).toBe('d');
  });

  it('handles Windows line endings', () => {
    expect(
      parseConceptBody(
        '## Description\r\nd\r\n## Learning Objectives\r\n- 目标\r\n',
      ),
    ).toEqual({ description: 'd', learningObjectives: ['目标'], warnings: [] });
  });

  it('returns an empty description and no objectives for empty sections', () => {
    expect(
      parseConceptBody('## Description\n\n## Learning Objectives\n'),
    ).toEqual({
      description: '',
      learningObjectives: [],
      warnings: [],
    });
  });

  it('warns about missing sections', () => {
    expect(warningsOf('# 只有标题')).toEqual([
      ['concept_body.missing_section', 'Description'],
      ['concept_body.missing_section', 'Learning Objectives'],
    ]);
    expect(parseConceptBody('')).toMatchObject({
      description: null,
      learningObjectives: null,
    });
  });

  it('warns about a duplicated section and uses the first one', () => {
    const body = [
      '## Description',
      '第一个',
      '## Description',
      '第二个',
      '## Learning Objectives',
    ].join('\n');
    expect(parseConceptBody(body).description).toBe('第一个');
    expect(warningsOf(body)).toEqual([
      ['concept_body.duplicate_section', 'Description'],
    ]);
  });
});
