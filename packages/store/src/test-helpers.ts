/// <reference types="vite/client" />
/**
 * 测试用：读取 `docs/protocol/*.md` 里的示例，作为测试数据（同时保证文档里的示例是对的）。
 * 只在测试里使用（依赖 Vite 的 `import.meta.glob`），不从 index.ts 导出。
 *
 * @internal
 */

const DOCS = import.meta.glob<string>('../../../docs/protocol/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** 文档里的一个代码块。 */
export interface DocExample {
  /** 文档的文件名，比如 `workspace.md`。 */
  readonly file: string;
  /** 代码块的语言。 */
  readonly lang: string;
  /** 代码块的内容，以换行结尾。 */
  readonly text: string;
}

/** 所有协议文档里的 `yaml` 和 `markdown` 代码块，按文件名排序。 */
export function docExamples(): DocExample[] {
  const examples: DocExample[] = [];
  for (const [path, content] of Object.entries(DOCS).sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    const file = path.slice(path.lastIndexOf('/') + 1);
    const fence = /^```(yaml|markdown)\n([\s\S]*?)^```$/gm;
    for (const match of content.matchAll(fence)) {
      examples.push({ file, lang: match[1] ?? '', text: match[2] ?? '' });
    }
  }
  return examples;
}

/** 某个文档里第一个指定语言的代码块。 */
export function docExample(file: string, lang: 'yaml' | 'markdown'): string {
  const example = docExamples().find((e) => e.file === file && e.lang === lang);
  if (example === undefined) {
    throw new Error(`no ${lang} example in docs/protocol/${file}`);
  }
  return example.text;
}
