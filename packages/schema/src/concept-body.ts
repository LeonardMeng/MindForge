import { makeIssue, type SchemaIssue } from './errors.js';

/** Concept 正文里约定的两个章节（英文二级标题，区分大小写）。 */
const SECTIONS = ['Description', 'Learning Objectives'] as const;
type Section = (typeof SECTIONS)[number];

/** 解析后的 Concept 正文。 */
export interface ConceptBody {
  /** `## Description` 一节的内容（去掉首尾空行）；没有这一节时为 `null`。 */
  readonly description: string | null;
  /** `## Learning Objectives` 一节的顶层列表项；没有这一节时为 `null`。 */
  readonly learningObjectives: string[] | null;
  /** 缺少或重复的章节。 */
  readonly warnings: SchemaIssue[];
}

/** 正文的一行，以及它是否在代码块里（含代码块的起止行）。 */
interface Line {
  readonly text: string;
  readonly inCode: boolean;
}

const HEADING = /^(#{1,2})\s+(.*?)\s*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const LIST_ITEM = /^(?:[-*+]|\d+[.)])\s+(.*?)\s*$/;

/**
 * 解析 Concept 正文里约定的章节：`## Description` 和 `## Learning Objectives`。
 *
 * - 只认这两个英文二级标题；其他章节和 `# 标题` 忽略。一节到下一个一级或二级标题为止。
 * - ``` 和 ~~~ 代码块里的内容不当作标题或列表项。
 * - 学习目标取顶层列表项（`-`、`*`、`+`、`1.`、`1)`），每项取第一行；嵌套内容忽略。
 * - 缺少或重复的章节给警告，不报错；重复时用第一个。
 *
 * 不依赖 Markdown 解析库（schema 包保持纯净）。
 *
 * @param body - frontmatter 之后的 Markdown 正文
 * @returns 两个章节的内容和警告
 */
export function parseConceptBody(body: string): ConceptBody {
  const sections = new Map<Section, Line[]>();
  const warnings: SchemaIssue[] = [];
  let current: Line[] | null = null;
  let fence: { char: string; length: number } | null = null;

  for (const text of body.split(/\r?\n/)) {
    if (fence !== null) {
      current?.push({ text, inCode: true });
      if (closesFence(text, fence)) fence = null;
      continue;
    }
    const opening = FENCE.exec(text)?.[1];
    if (opening !== undefined) {
      fence = { char: opening.charAt(0), length: opening.length };
      current?.push({ text, inCode: true });
      continue;
    }
    const heading = HEADING.exec(text);
    if (heading !== null) {
      const section = asSection(heading[1], heading[2]);
      if (section === null) {
        current = null;
      } else if (sections.has(section)) {
        warnings.push(
          makeIssue('concept_body.duplicate_section', [], { section }),
        );
        current = null;
      } else {
        current = [];
        sections.set(section, current);
      }
      continue;
    }
    current?.push({ text, inCode: false });
  }

  for (const section of SECTIONS) {
    if (!sections.has(section)) {
      warnings.push(makeIssue('concept_body.missing_section', [], { section }));
    }
  }

  const description = sections.get('Description');
  const objectives = sections.get('Learning Objectives');
  return {
    description: description === undefined ? null : sectionText(description),
    learningObjectives: objectives === undefined ? null : listItems(objectives),
    warnings,
  };
}

function asSection(
  level: string | undefined,
  title: string | undefined,
): Section | null {
  if (level !== '##') return null;
  return SECTIONS.find((section) => section === title) ?? null;
}

function closesFence(
  text: string,
  fence: { char: string; length: number },
): boolean {
  const match = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(text)?.[1];
  return (
    match !== undefined &&
    match.charAt(0) === fence.char &&
    match.length >= fence.length
  );
}

/** 一节的文字：去掉首尾的空行，中间保持原样。 */
function sectionText(lines: readonly Line[]): string {
  const texts = lines.map((line) => line.text);
  let start = 0;
  let end = texts.length;
  while (start < end && texts[start]?.trim() === '') start++;
  while (end > start && texts[end - 1]?.trim() === '') end--;
  return texts.slice(start, end).join('\n');
}

/** 顶层列表项的第一行文字（代码块里的不算）。 */
function listItems(lines: readonly Line[]): string[] {
  const items: string[] = [];
  for (const line of lines) {
    if (line.inCode) continue;
    const item = LIST_ITEM.exec(line.text)?.[1];
    if (item !== undefined && item !== '') items.push(item);
  }
  return items;
}
