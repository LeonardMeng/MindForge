import type { z } from 'zod';

import { Blindspot } from './blindspot.js';
import { ConceptFrontmatter } from './concept.js';
import { Criteria } from './criteria.js';
import { DeviceConfig } from './device.js';
import { validate, type SchemaIssue } from './errors.js';
import { Evidence } from './evidence.js';
import { Intervention } from './intervention.js';
import { MasteryHistoryEntry, MasteryProjection } from './mastery.js';
import {
  ConceptLinks,
  ProfileConfig,
  ProfileDefaults,
  WorkspaceRegistry,
} from './profile.js';
import { createMigrator, type MigrationTable } from './migration.js';
import { ProjectConfig } from './project.js';
import { Proposal } from './proposal.js';
import { AssessmentSession } from './session.js';
import { CURRENT_SCHEMA_VERSIONS, type FileKind } from './versions.js';
import { WorkspaceConfig } from './workspace.js';

/** 登记表里的一种文件。 */
export interface FileKindEntry<S extends z.ZodType = z.ZodType> {
  /** 当前版本的 schema。 */
  readonly schema: S;
  /** 当前版本（来自 `CURRENT_SCHEMA_VERSIONS`）。 */
  readonly currentVersion: number;
  /** 文件在 Workspace 里的位置，用于协议文档和导出的 JSON Schema 的 title。 */
  readonly path: string;
  /** 一句英文说明，写进导出的 JSON Schema。 */
  readonly description: string;
  /** 迁移步骤：`migrations[N]` 把版本 N 升级到 N+1。现在所有文件都是 v1，还没有迁移。 */
  readonly migrations: MigrationTable['steps'];
}

function entry<K extends FileKind, S extends z.ZodType>(
  kind: K,
  schema: S,
  path: string,
  description: string,
  migrations: MigrationTable['steps'] = {},
): FileKindEntry<S> {
  return {
    schema,
    currentVersion: CURRENT_SCHEMA_VERSIONS[kind],
    path,
    description,
    migrations,
  };
}

/**
 * 文件协议里每种文件的登记表：schema、当前版本、位置和迁移步骤都在这里登记一次。
 * 协议文档的 JSON Schema（`pnpm --filter @mastery/schema gen`）也从这里生成。
 */
export const FILE_KINDS = {
  workspace: entry(
    'workspace',
    WorkspaceConfig,
    'workspace.yaml',
    'Configuration of a Mastery OS workspace.',
  ),
  project: entry(
    'project',
    ProjectConfig,
    'projects/<slug>/project.yaml',
    'A learning or research goal inside a workspace.',
  ),
  'concept-frontmatter': entry(
    'concept-frontmatter',
    ConceptFrontmatter,
    'concepts/<slug>.md (frontmatter)',
    'YAML frontmatter of a concept. Unknown fields are kept for Obsidian compatibility.',
  ),
  criteria: entry(
    'criteria',
    Criteria,
    'assessments/<slug>/criteria.yaml',
    'Versioned assessment criteria of a concept.',
  ),
  'assessment-session': entry(
    'assessment-session',
    AssessmentSession,
    'assessments/<slug>/sessions/<ULID>.json',
    'A completed assessment session. Append-only.',
  ),
  evidence: entry(
    'evidence',
    Evidence,
    'evidence/<slug>/<ULID>.json',
    'One piece of evidence of mastery. Append-only.',
  ),
  'mastery-projection': entry(
    'mastery-projection',
    MasteryProjection,
    'mastery/<slug>.yaml',
    'Mastery projection computed by Mastery Core. Derived data.',
  ),
  'mastery-history-entry': entry(
    'mastery-history-entry',
    MasteryHistoryEntry,
    'mastery/history/<slug>.jsonl (one line)',
    'One line of the mastery history (derived from the evidence and written only by Mastery Core).',
  ),
  blindspot: entry(
    'blindspot',
    Blindspot,
    'blindspots/<ULID>.yaml',
    'A suspected or confirmed knowledge gap, misconception or weakness.',
  ),
  intervention: entry(
    'intervention',
    Intervention,
    'interventions/<ULID>.yaml',
    'A learning activity designed for a blindspot.',
  ),
  proposal: entry(
    'proposal',
    Proposal,
    'Proposal (storage to be decided in 4.2 / 6.8)',
    'A set of changes submitted by an agent or the user to the knowledge service.',
  ),
  profile: entry(
    'profile',
    ProfileConfig,
    '<profile>/profile.yaml',
    "The user's profile: display name, language and weekly time budget.",
  ),
  'workspace-registry': entry(
    'workspace-registry',
    WorkspaceRegistry,
    '<profile>/workspaces.yaml',
    'Workspaces registered in the profile, with their Git remotes (no local paths).',
  ),
  'concept-links': entry(
    'concept-links',
    ConceptLinks,
    '<profile>/concept-links.yaml',
    'Relations between concepts in different workspaces.',
  ),
  'profile-defaults': entry(
    'profile-defaults',
    ProfileDefaults,
    '<profile>/defaults.yaml',
    'Default plugin and model settings; a workspace can override them. No secrets.',
  ),
  device: entry(
    'device',
    DeviceConfig,
    '~/.mastery/device.yaml',
    'Settings that belong to one device. Never committed or synced; no secrets.',
  ),
} as const satisfies Record<FileKind, FileKindEntry>;

/** 所有文件种类的名字，顺序和登记表一致。 */
export const FILE_KIND_NAMES = Object.keys(FILE_KINDS) as readonly FileKind[];

/** 某种文件当前版本的数据类型。 */
export type FileData<K extends FileKind> = z.output<
  (typeof FILE_KINDS)[K]['schema']
>;

/**
 * 把某种文件的数据从任意旧版本逐级升级到当前版本（只在内存里，不改写磁盘）。
 * 结果还没有按当前 schema 校验；要校验用 {@link validateFile}。
 */
export const migrate = createMigrator(
  Object.fromEntries(
    FILE_KIND_NAMES.map((kind) => [
      kind,
      {
        currentVersion: FILE_KINDS[kind].currentVersion,
        steps: FILE_KINDS[kind].migrations,
      },
    ]),
  ) as Record<FileKind, MigrationTable>,
);

/** {@link validateFile} 的结果。 */
export type FileValidationResult<T> =
  | {
      readonly success: true;
      readonly data: T;
      /** 文件原来的版本。 */
      readonly from: number;
      /** 当前版本。`from < to` 说明这是旧格式的文件，可以提示用户运行 `mastery migrate`。 */
      readonly to: number;
    }
  | { readonly success: false; readonly issues: SchemaIssue[] };

/**
 * 先 {@link migrate} 到当前版本，再按当前 schema 校验。读文件时用它。
 *
 * 版本过新时直接返回 `migration.version_too_new`，不校验内容：这样的文件只能读，不能修改。
 *
 * @param kind - 文件种类
 * @param data - 解析后的文件内容（JSON 或 YAML 解析的结果）
 */
export function validateFile<K extends FileKind>(
  kind: K,
  data: unknown,
): FileValidationResult<FileData<K>> {
  const migrated = migrate(kind, data);
  if (!migrated.success) return migrated;
  const result = validate(FILE_KINDS[kind].schema, migrated.data);
  if (!result.success) return result;
  return {
    success: true,
    data: result.data as FileData<K>,
    from: migrated.from,
    to: migrated.to,
  };
}
