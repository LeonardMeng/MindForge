import {
  Document,
  isAlias,
  isMap,
  isNode,
  isScalar,
  isSeq,
  LineCounter,
  parseAllDocuments,
  parseDocument,
  Scalar,
  visit,
  type Node,
  type Pair,
  type ToStringOptions,
  type YAMLError,
} from 'yaml';

import { deepEqual, isPlainObject } from './equal.js';
import type { RawIssue } from './errors.js';

/** 解析选项：YAML 1.2 的 core schema（没有时间戳类型，`yes` / `no` 是字符串），不合并 `<<`，键不能重复。 */
const PARSE_OPTIONS = {
  version: '1.2',
  schema: 'core',
  merge: false,
  uniqueKeys: true,
  strict: true,
  prettyErrors: false,
} as const;

/**
 * 写出时还要让 YAML 1.1 的工具（很多编辑器插件、其他语言的库）读出同样的值：
 * `yes`、`on`、时间戳这类字符串加上引号。
 */
const STRINGIFY_OPTIONS = { ...PARSE_OPTIONS, compat: 'yaml-1.1' } as const;

/** 不折行，两格缩进，`[a, b]` 两边不加空格。 */
const TO_STRING: ToStringOptions = {
  lineWidth: 0,
  indent: 2,
  indentSeq: true,
  flowCollectionPadding: false,
};

/** 解析成功的 YAML：数据，以及保留注释和格式的文档（空文件时为 null）。 */
export interface YamlParsed {
  readonly ok: true;
  readonly data: unknown;
  readonly doc: Document.Parsed | null;
}

/** {@link parseYaml} 的结果。 */
export type YamlParseResult =
  YamlParsed | { readonly ok: false; readonly issues: RawIssue[] };

type ScalarValue = string | number | boolean | null;

function isScalarValue(value: unknown): value is ScalarValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/**
 * 严格地解析 YAML（ADR-0013：同一个值只有一种写法）。下面这些都直接报错：
 * 锚点和别名、合并键 `<<`、所有标签（包括 `!!str`）、重复的键、不是字符串的键、
 * 多个文档、`%YAML` / `%TAG` 指令。空文件解析为 `null`。
 *
 * @param text - YAML 文本
 */
export function parseYaml(text: string): YamlParseResult {
  const lineCounter = new LineCounter();
  const docs = parseAllDocuments(text, { ...PARSE_OPTIONS, lineCounter });
  const line = (offset: number | undefined) =>
    offset === undefined ? 0 : lineCounter.linePos(offset).line;
  const fail = (issues: RawIssue[]): YamlParseResult => ({ ok: false, issues });

  if (docs.length === 0) return { ok: true, data: null, doc: null };
  if (docs.length > 1) {
    return fail([{ code: 'yaml.multiple_documents', path: [], params: {} }]);
  }
  const doc = docs[0] as Document.Parsed;

  const toIssues = (problems: readonly YAMLError[]): RawIssue[] =>
    problems.map((problem): RawIssue => {
      const pos = lineCounter.linePos(problem.pos[0]);
      return problem.code === 'DUPLICATE_KEY'
        ? {
            code: 'yaml.duplicate_key',
            path: [],
            params: { line: pos.line },
          }
        : {
            code: 'yaml.syntax',
            path: [],
            params: {
              line: pos.line,
              column: pos.col,
              detail: problem.message.split('\n')[0] ?? problem.code,
            },
          };
    });
  // 语法错误优先；然后是“同一个值只有一种写法”的检查（它们也会让解析器给出警告，比如不认识的标签）；
  // 最后才是其余的警告。
  if (doc.errors.length > 0) return fail(toIssues(doc.errors));

  const issues: RawIssue[] = [];
  if (doc.directives.yaml.explicit) {
    issues.push({
      code: 'yaml.directive_not_allowed',
      path: [],
      params: { directive: 'YAML' },
    });
  }
  if (Object.keys(doc.directives.tags).some((handle) => handle !== '!!')) {
    issues.push({
      code: 'yaml.directive_not_allowed',
      path: [],
      params: { directive: 'TAG' },
    });
  }
  visit(doc, {
    Pair(_, pair) {
      const key = pair.key;
      const at = isNode(key) ? line(key.range?.[0]) : 0;
      if (!isScalar(key) || typeof key.value !== 'string') {
        issues.push({
          code: 'yaml.key_not_string',
          path: [],
          params: { line: at },
        });
      } else if (key.value === '<<') {
        issues.push({
          code: 'yaml.merge_key_not_allowed',
          path: [],
          params: { line: at },
        });
      }
    },
    Node(_, node) {
      const at = line(node.range?.[0]);
      if (isAlias(node)) {
        issues.push({
          code: 'yaml.alias_not_allowed',
          path: [],
          params: { alias: node.source, line: at },
        });
        return;
      }
      if (node.anchor !== undefined) {
        issues.push({
          code: 'yaml.anchor_not_allowed',
          path: [],
          params: { anchor: node.anchor, line: at },
        });
      }
      if (node.tag !== undefined) {
        issues.push({
          code: 'yaml.tag_not_allowed',
          path: [],
          params: { tag: node.tag, line: at },
        });
      }
    },
  });
  if (issues.length > 0) return fail(issues);
  if (doc.warnings.length > 0) return fail(toIssues(doc.warnings));
  return { ok: true, data: doc.toJS(), doc };
}

/**
 * 规范形式：键按给定的顺序（store 传入的是 schema 校验后的值，键已经是 schema 的顺序），
 * 标量组成的列表写成 `[a, b]`，其余用块格式。同一个值总是写出同样的字节。
 *
 * @param value - 要写出的值
 */
export function stringifyYaml(value: unknown): string {
  const doc = new Document(value, STRINGIFY_OPTIONS);
  flowScalarLists(doc);
  return doc.toString(TO_STRING);
}

/** 只含标量的列表用 `[a, b]` 的写法。 */
function flowScalarLists(node: Document | Node): void {
  visit(node, {
    Seq(_, seq) {
      if (seq.items.every((item) => isScalar(item))) seq.flow = true;
    },
  });
}

/**
 * 把 `source`（它解析的结果是 `base`）改写成表示 `next` 的文本，尽量少动：
 *
 * 1. 没有变化时原样返回。
 * 2. 只有标量的值变了、新值能写在一行里时，只替换这些值在源文件里的那一段，
 *    其余每个字节都不变（引号风格沿用原来的）。
 * 3. 否则（加减键、列表长度变化、多行的值等）在原文档上修改后重新序列化：
 *    注释、键的顺序和引号风格保留，但空白可能被规范化。新加的键放在 schema 里排在它前面的键之后。
 *
 * 每一步的结果都重新解析一遍，确认表示的正是 `next`。
 *
 * @param source - 原来的 YAML 文本
 * @param base - `source` 的解析结果
 * @param next - 要写成的值
 * @param eol - 换行符；不给时沿用 `source` 的（有 `\r\n` 就用 `\r\n`）
 */
export function patchYaml(
  source: string,
  base: YamlParsed,
  next: unknown,
  eol: '\n' | '\r\n' = source.includes('\r\n') ? '\r\n' : '\n',
): string {
  if (deepEqual(base.data, next)) return source;

  if (base.doc?.contents != null) {
    const edits: Edit[] = [];
    if (collectEdits(base.doc.contents, base.data, next, edits)) {
      let text = source;
      for (const edit of edits.sort((a, b) => b.start - a.start)) {
        text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
      }
      if (represents(text, next)) return text;
    }
  }

  const bom = source.startsWith('\uFEFF') ? '\uFEFF' : '';
  const doc = parseDocument(source, STRINGIFY_OPTIONS);
  doc.contents = patchNode(
    doc,
    doc.contents,
    base.data,
    next,
  ) as typeof doc.contents;
  const text = bom + withEol(doc.toString(TO_STRING), eol);
  if (represents(text, next)) return text;
  throw new Error('internal error: could not write the value as YAML');
}

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** 找出只需要替换标量的修改；需要改结构时返回 false。 */
function collectEdits(
  node: unknown,
  old: unknown,
  next: unknown,
  edits: Edit[],
): boolean {
  if (deepEqual(old, next)) return true;
  if (isMap(node) && isPlainObject(old) && isPlainObject(next)) {
    const keys = Object.keys(old);
    if (
      keys.length !== Object.keys(next).length ||
      !keys.every((key) => Object.hasOwn(next, key))
    ) {
      return false;
    }
    return keys.every((key) => {
      const pair = findPair(node.items, key);
      return (
        pair !== undefined &&
        collectEdits(pair.value, old[key], next[key], edits)
      );
    });
  }
  if (isSeq(node) && Array.isArray(old) && Array.isArray(next)) {
    return (
      old.length === next.length &&
      node.items.length === next.length &&
      node.items.every((item, index) =>
        collectEdits(item, old[index], next[index], edits),
      )
    );
  }
  if (isScalar(node) && isScalarValue(next)) {
    const range = node.range;
    if (range === undefined || range === null || range[0] === range[1]) {
      return false;
    }
    if (node.type === 'BLOCK_LITERAL' || node.type === 'BLOCK_FOLDED') {
      return false;
    }
    const text = scalarSource(next, node.type);
    if (text.includes('\n')) return false;
    edits.push({ start: range[0], end: range[1], text });
    return true;
  }
  return false;
}

/** 一个标量单独写出来的样子，尽量沿用原来的引号风格。 */
function scalarSource(value: ScalarValue, type: Scalar['type']): string {
  const scalar = new Scalar(value);
  if (
    typeof value === 'string' &&
    (type === 'PLAIN' || type === 'QUOTE_DOUBLE' || type === 'QUOTE_SINGLE')
  ) {
    scalar.type = type;
  }
  const text = new Document(scalar, STRINGIFY_OPTIONS).toString(TO_STRING);
  return text.endsWith('\n') ? text.slice(0, -1) : text;
}

/** 在文档上把 `old` 改成 `next`，返回改好的节点（可能是新建的）。 */
function patchNode(
  doc: Document,
  node: unknown,
  old: unknown,
  next: unknown,
): unknown {
  if (isNode(node) && deepEqual(old, next)) return node;
  if (isMap(node) && isPlainObject(old) && isPlainObject(next)) {
    for (const key of Object.keys(old)) {
      if (!Object.hasOwn(next, key)) node.delete(key);
    }
    let previous = -1;
    for (const [key, value] of Object.entries(next)) {
      const index = node.items.findIndex((pair) => keyOf(pair) === key);
      if (index === -1) {
        const pair = doc.createPair(key, value);
        if (isNode(pair.value)) flowScalarLists(pair.value);
        node.items.splice(previous + 1, 0, pair);
        previous += 1;
      } else {
        const pair = node.items[index] as Pair;
        pair.value = patchNode(doc, pair.value, old[key], value);
        previous = Math.max(previous, index);
      }
    }
    return node;
  }
  if (
    isSeq(node) &&
    Array.isArray(old) &&
    Array.isArray(next) &&
    old.length === next.length &&
    node.items.length === next.length
  ) {
    node.items = node.items.map((item, index) =>
      patchNode(doc, item, old[index], next[index]),
    );
    return node;
  }
  if (isScalar(node) && isScalarValue(old) && isScalarValue(next)) {
    // 类型变了（比如字符串变成数字）时不沿用引号风格。
    if (typeof old !== typeof next || next === null) node.type = undefined;
    node.value = next;
    return node;
  }
  const created = doc.createNode(next);
  flowScalarLists(created);
  if (isSeq(node) && isSeq(created)) created.flow = node.flow ?? false;
  if (isNode(node)) {
    created.commentBefore = node.commentBefore;
    created.comment = node.comment;
  }
  return created;
}

function findPair(items: unknown[], key: string): Pair | undefined {
  return items.find((pair): pair is Pair => keyOf(pair) === key);
}

function keyOf(pair: unknown): unknown {
  if (typeof pair !== 'object' || pair === null || !('key' in pair)) {
    return undefined;
  }
  return isScalar(pair.key) ? pair.key.value : pair.key;
}

function represents(text: string, next: unknown): boolean {
  const parsed = parseYaml(text);
  return parsed.ok && deepEqual(parsed.data, next);
}

function withEol(text: string, eol: '\n' | '\r\n'): string {
  return eol === '\n' ? text : text.replace(/\r?\n/g, '\r\n');
}
