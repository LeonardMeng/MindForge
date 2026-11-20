import { z } from 'zod';

import {
  LANGUAGE_TAG_PATTERN,
  patternMeta,
  WEEKLY_MINUTES_RANGE,
} from './constraints.js';
import { ModelRef } from './actor.js';
import { pushIssue } from './errors.js';
import { integerIn, listOf, NonEmptyString } from './fields.js';
import { GlobalConceptRef, parseGlobalConceptRef, Slug, Ulid } from './ids.js';
import { GitRemote } from './locations.js';
import { noSecrets } from './secrets.js';
import { schemaVersionOf } from './versions.js';
import { Plugins } from './workspace.js';

/** BCP 47 语言标签，只有一种大小写写法：`zh-CN`、`zh-Hans-CN`、`en`、`es-419`。 */
const LanguageTag = z
  .string()
  .check((ctx) => {
    if (!LANGUAGE_TAG_PATTERN.test(ctx.value)) {
      pushIssue(ctx, 'profile.invalid_language', { value: ctx.value });
    }
  })
  .meta(patternMeta(LANGUAGE_TAG_PATTERN));

/**
 * Profile 的 `profile.yaml`：用户本人的基本信息和偏好。
 *
 * 目标（goals）暂时不放：7.4 / 8.4 才用到，到时很可能每个目标一个文件，避免多台设备同时修改一个列表。
 * 学习者画像在 `learner-model/`（M8），不在这里。
 */
export const ProfileConfig = z.strictObject({
  schema_version: schemaVersionOf('profile'),
  /** Profile 的 id，创建时生成，之后不变。 */
  id: Ulid,
  /** 显示名称。 */
  name: NonEmptyString,
  /** 界面和讲解用的语言。 */
  language: LanguageTag,
  /** 每周的学习时间预算（分钟），`null` 表示没有设置。 */
  weekly_minutes: integerIn(WEEKLY_MINUTES_RANGE).nullable(),
});
/** `profile.yaml` 的内容。 */
export type ProfileConfig = z.infer<typeof ProfileConfig>;

const RegisteredWorkspace = z.strictObject({
  id: Slug,
  name: NonEmptyString,
  /** Git 远程地址；没有远程时写 `null`。不能是本机路径，也不能带凭据。 */
  remote: GitRemote.nullable(),
});

/**
 * Profile 的 `workspaces.yaml`：已注册的 Workspace。不写本地路径（路径在 `device.yaml` 里）。
 * id 不能重复。
 */
export const WorkspaceRegistry = noSecrets(
  z.strictObject({
    schema_version: schemaVersionOf('workspace-registry'),
    workspaces: listOf('workspaces', RegisteredWorkspace, {
      unique: false,
    }).check((ctx) => {
      const seen = new Set<string>();
      ctx.value.forEach((workspace, index) => {
        if (seen.has(workspace.id)) {
          pushIssue(
            ctx,
            'workspace_registry.duplicate_id',
            { id: workspace.id },
            [index, 'id'],
          );
        }
        seen.add(workspace.id);
      });
    }),
  }),
);
/** `workspaces.yaml` 的内容。 */
export type WorkspaceRegistry = z.infer<typeof WorkspaceRegistry>;

/** 概念之间的关系。现在只有 `requires`（`from` 需要先掌握 `to`）。 */
export const ConceptLinkRelation = z.enum(['requires']);

const ConceptLink = z.strictObject({
  from: GlobalConceptRef,
  relation: ConceptLinkRelation,
  to: GlobalConceptRef,
});

/**
 * Profile 的 `concept-links.yaml`：**跨 Workspace** 的概念关系。
 * 同一个 Workspace 里的前置依赖写在 Concept 的 frontmatter 里，这里不接受。
 * 两端的 Workspace 是否已注册，由 Profile 的领域逻辑检查（1.12）。
 */
export const ConceptLinks = z.strictObject({
  schema_version: schemaVersionOf('concept-links'),
  links: listOf('links', ConceptLink, { unique: false }).check((ctx) => {
    const seen = new Set<string>();
    ctx.value.forEach((link, index) => {
      const key = `${link.from} ${link.relation} ${link.to}`;
      if (link.from === link.to) {
        pushIssue(ctx, 'concept_link.self', { value: link.from }, [index]);
      } else if (
        parseGlobalConceptRef(link.from).workspace ===
        parseGlobalConceptRef(link.to).workspace
      ) {
        pushIssue(
          ctx,
          'concept_link.same_workspace',
          { workspace: parseGlobalConceptRef(link.from).workspace },
          [index],
        );
      } else if (seen.has(key)) {
        pushIssue(ctx, 'concept_link.duplicate', { value: key }, [index]);
      }
      seen.add(key);
    });
  }),
});
/** `concept-links.yaml` 的内容。 */
export type ConceptLinks = z.infer<typeof ConceptLinks>;

/**
 * Profile 的 `defaults.yaml`：插件和模型的默认配置，Workspace 可以覆盖。
 * 插件规则和 `workspace.yaml` 相同；不能有密钥。
 */
export const ProfileDefaults = noSecrets(
  z.strictObject({
    schema_version: schemaVersionOf('profile-defaults'),
    plugins: Plugins,
    /** 默认模型，`null` 表示没有设置。 */
    model: ModelRef.nullable(),
  }),
);
/** `defaults.yaml` 的内容。 */
export type ProfileDefaults = z.infer<typeof ProfileDefaults>;
