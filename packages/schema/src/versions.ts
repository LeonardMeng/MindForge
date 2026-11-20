import { z } from 'zod';

/**
 * 每种文件的当前格式版本。版本号只在这里定义一次：文件 schema 的 `schema_version`
 * 和登记表（`file-kinds.ts`）都引用它。升版本见 `docs/adding-a-migration.md`。
 */
export const CURRENT_SCHEMA_VERSIONS = {
  workspace: 1,
  project: 1,
  'concept-frontmatter': 1,
  criteria: 1,
  'assessment-session': 1,
  evidence: 1,
  'mastery-projection': 1,
  'mastery-history-entry': 1,
  blindspot: 1,
  intervention: 1,
  proposal: 1,
  profile: 1,
  'workspace-registry': 1,
  'concept-links': 1,
  'profile-defaults': 1,
  device: 1,
} as const;

/** 文件协议里的一种文件。 */
export type FileKind = keyof typeof CURRENT_SCHEMA_VERSIONS;

/**
 * 某种文件当前版本的 `schema_version` 字段：只接受当前版本。
 * 旧版本的文件要先经过 {@link migrate}，再按当前 schema 校验。
 *
 * @internal
 */
export function schemaVersionOf<K extends FileKind>(kind: K) {
  return z.literal(CURRENT_SCHEMA_VERSIONS[kind]);
}
