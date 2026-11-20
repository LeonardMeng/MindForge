// docs/protocol/*.md 里的 YAML 示例（和 Concept 的 Markdown 示例）必须能通过校验。
// JSON 示例由 schema 包的 examples.test.ts 校验。
import { validateFile, type FileKind } from '@mastery/schema';
import { describe, expect, it } from 'vitest';

import { splitFrontmatter } from './frontmatter.js';
import { docExamples } from './test-helpers.js';
import { parseYaml } from './yaml.js';

/** 每个说明页的示例是哪种文件。 */
const KIND_OF_DOC: Readonly<Record<string, FileKind>> = {
  'workspace.md': 'workspace',
  'project.md': 'project',
  'concept.md': 'concept-frontmatter',
  'criteria.md': 'criteria',
  'mastery.md': 'mastery-projection',
  'blindspot.md': 'blindspot',
  'intervention.md': 'intervention',
};

describe('docs/protocol YAML examples', () => {
  const examples = docExamples();

  it('covers every page with a YAML or Markdown example', () => {
    expect([...new Set(examples.map((e) => e.file))].sort()).toEqual(
      Object.keys(KIND_OF_DOC).sort(),
    );
  });

  it.each(examples.map((e, i) => [`${e.file} #${String(i)}`, e] as const))(
    '%s is valid',
    (_name, example) => {
      const kind = KIND_OF_DOC[example.file];
      if (kind === undefined) throw new Error(`unknown page ${example.file}`);
      let yaml = example.text;
      if (example.lang === 'markdown') {
        const split = splitFrontmatter(example.text);
        if (!split.ok) throw new Error(split.code);
        yaml = split.parts.yaml;
      }
      const parsed = parseYaml(yaml);
      expect(parsed.ok ? [] : parsed.issues).toEqual([]);
      if (!parsed.ok) return;
      const result = validateFile(kind, parsed.data);
      expect(result.success ? [] : result.issues).toEqual([]);
    },
  );
});
