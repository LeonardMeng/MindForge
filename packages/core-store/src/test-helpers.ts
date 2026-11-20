/**
 * 测试用的工具（不导出到包外）。
 */
import type { RepositorySeed } from '@mastery/core/testing';
import type { FileSystem } from '@mastery/platform';
import { stringifyYaml } from '@mastery/store';

export async function put(
  fs: FileSystem,
  path: string,
  text: string,
): Promise<void> {
  const parent = path.slice(0, path.lastIndexOf('/'));
  await fs.mkdir(parent, { recursive: true });
  await fs.writeTextFile(path, text);
}

/** 直接写文件，不经过 store，也不校验。 */
export function fileSeed(fs: FileSystem): RepositorySeed {
  const json = (data: unknown) => `${JSON.stringify(data, null, 2)}\n`;
  return {
    concept: (slug, frontmatter) =>
      put(
        fs,
        `concepts/${slug}.md`,
        `---\n${stringifyYaml(frontmatter)}---\n\n# ${slug}\n`,
      ),
    criteria: (slug, data) =>
      put(fs, `assessments/${slug}/criteria.yaml`, stringifyYaml(data)),
    session: (slug, id, data) =>
      put(fs, `assessments/${slug}/sessions/${id}.json`, json(data)),
    evidence: (slug, id, data) =>
      put(fs, `evidence/${slug}/${id}.json`, json(data)),
    mastery: (slug, data) =>
      put(fs, `mastery/${slug}.yaml`, stringifyYaml(data)),
    history: (slug, lines) =>
      put(
        fs,
        `mastery/history/${slug}.jsonl`,
        lines.map((line) => `${JSON.stringify(line)}\n`).join(''),
      ),
  };
}

/** 文件系统里全部文件的内容，按路径排序（不变量 9：拒绝时什么都不变）。 */
export async function allFiles(fs: FileSystem): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  async function walk(dir: string): Promise<void> {
    for (const entry of await fs.list(dir)) {
      const path = dir === '' ? entry.name : `${dir}/${entry.name}`;
      if (entry.kind === 'directory') await walk(path);
      else files.set(path, await fs.readTextFile(path));
    }
  }
  await walk('');
  return files;
}
