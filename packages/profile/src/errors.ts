import type { SchemaIssue } from '@mastery/schema';

import type { ProfileDocument } from './types.js';

type Params = Readonly<Record<string, string | number>>;
const text = (value: string | number | undefined): string =>
  String(value ?? '');

/** Profile 的错误码（英文消息）。 */
const MESSAGES_EN = {
  'profile.not_found': () =>
    'there is no profile yet; create one first (mastery profile init)',
  'profile.already_exists': () => 'a profile already exists',
  'profile.invalid': () => 'the profile is not valid; see the issues',
  'profile.version_too_new': (p: Params) =>
    `${text(p.document)} was written by a newer version of Mastery OS; upgrade Mastery OS to change the profile`,
  'profile.id_changed': (p: Params) =>
    `the profile id cannot change (from ${text(p.from)} to ${text(p.to)})`,
  'profile.workspace_already_registered': (p: Params) =>
    `workspace "${text(p.id)}" is already registered`,
  'profile.workspace_not_registered': (p: Params) =>
    `workspace "${text(p.id)}" is not registered`,
  'profile.link_workspace_not_registered': (p: Params) =>
    `"${text(p.ref)}" is in workspace "${text(p.workspace)}", which is not registered in workspaces.yaml`,
  'profile.modified_since_load': () =>
    'the profile changed since it was loaded; load it again and reapply the change',
  'profile.conflict_unresolved': (p: Params) =>
    `${text(p.document)} has an unresolved sync conflict; resolve it (keep the local or the remote version) first`,
  'profile.no_conflict': (p: Params) =>
    `${text(p.document)} has no sync conflict to resolve`,
} as const satisfies Record<string, (p: Params) => string>;

/** Profile 的错误码。 */
export type ProfileErrorCode = keyof typeof MESSAGES_EN;

/** 所有 Profile 错误码。 */
export const PROFILE_ERROR_CODES = Object.keys(
  MESSAGES_EN,
) as ProfileErrorCode[];

/** 一个具体的问题：schema 的校验错误，或跨文档的规则。 */
export interface ProfileIssue {
  /** 出问题的文档；跨文档的问题记在被检查的那个文档上。 */
  readonly document: ProfileDocument;
  readonly code: ProfileErrorCode | SchemaIssue['code'];
  /** 文档里的字段路径。 */
  readonly path: readonly (string | number)[];
  readonly params: Readonly<Record<string, unknown>>;
  readonly message: string;
}

/** 操作失败的原因。 */
export interface ProfileError {
  readonly code: ProfileErrorCode;
  readonly params: Params;
  readonly message: string;
  /** 具体的问题（`profile.invalid` 和跨文档规则时有）。 */
  readonly issues: readonly ProfileIssue[];
}

/** 构造一个错误。 */
export function profileError(
  code: ProfileErrorCode,
  params: Params = {},
  issues: readonly ProfileIssue[] = [],
): ProfileError {
  return { code, params, message: MESSAGES_EN[code](params), issues };
}

/** 构造一条跨文档规则的问题。 */
export function profileIssue(
  document: ProfileDocument,
  code: ProfileErrorCode,
  params: Params,
  path: readonly (string | number)[],
): ProfileIssue {
  return { document, code, path, params, message: MESSAGES_EN[code](params) };
}

/** schema 的问题加上文档名。 */
export function fromSchemaIssue(
  document: ProfileDocument,
  issue: SchemaIssue,
): ProfileIssue {
  return {
    document,
    code: issue.code,
    path: issue.path,
    params: issue.params,
    message: issue.message,
  };
}
