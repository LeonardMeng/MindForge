/** 拆开的 Concept 文件：拼回去逐字节不变。 */
export interface FrontmatterParts {
  /** 文件开头的 BOM（`'\uFEFF'`），没有时为 `''`。 */
  readonly bom: string;
  /** 开头那一行 `---` 用的换行符，新写的 frontmatter 也用它。 */
  readonly eol: '\n' | '\r\n';
  /** 两行 `---` 之间的 YAML，原样保留（含最后的换行）。 */
  readonly yaml: string;
  /** 结束的那一行，`---` 加上它的换行（文件到此结束时没有换行）。 */
  readonly closing: string;
  /** 结束行之后的正文，原样保留。 */
  readonly body: string;
}

/** {@link splitFrontmatter} 的结果。 */
export type SplitResult =
  | { readonly ok: true; readonly parts: FrontmatterParts }
  | {
      readonly ok: false;
      readonly code: 'frontmatter.missing' | 'frontmatter.unclosed';
    };

const MARKER = '---';

/**
 * 拆出 Concept 文件的 frontmatter：文件（BOM 之后）第一行必须恰好是 `---`，
 * 下一行恰好是 `---` 的地方结束。别的写法（比如 `...` 结束、行尾有空格）一律不认。
 *
 * @param text - 整个文件的内容
 */
export function splitFrontmatter(text: string): SplitResult {
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const rest = text.slice(bom.length);
  let eol: '\n' | '\r\n';
  if (rest.startsWith(`${MARKER}\r\n`)) eol = '\r\n';
  else if (rest.startsWith(`${MARKER}\n`)) eol = '\n';
  else return { ok: false, code: 'frontmatter.missing' };

  const yamlStart = MARKER.length + eol.length;
  let lineStart = yamlStart;
  while (lineStart <= rest.length) {
    const newline = rest.indexOf('\n', lineStart);
    const lineEnd = newline === -1 ? rest.length : newline;
    let line = rest.slice(lineStart, lineEnd);
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (line === MARKER) {
      const closingEnd = newline === -1 ? rest.length : newline + 1;
      return {
        ok: true,
        parts: {
          bom,
          eol,
          yaml: rest.slice(yamlStart, lineStart),
          closing: rest.slice(lineStart, closingEnd),
          body: rest.slice(closingEnd),
        },
      };
    }
    if (newline === -1) break;
    lineStart = newline + 1;
  }
  return { ok: false, code: 'frontmatter.unclosed' };
}

/** 把 {@link splitFrontmatter} 拆开的部分拼回文件。 */
export function joinFrontmatter(parts: FrontmatterParts): string {
  return `${parts.bom}${MARKER}${parts.eol}${parts.yaml}${parts.closing}${parts.body}`;
}
