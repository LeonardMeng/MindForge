/**
 * Profile 的领域规则：纯函数，不做 I/O。{@link createProfileStore} 在每次写入时用它们，
 * 各个后端实现（Git、将来的云）不需要、也不能自己实现这些规则。
 */
import { parseGlobalConceptRef } from '@mastery/schema';

import { profileError, profileIssue, type ProfileIssue } from './errors.js';
import type {
  ConceptLink,
  Profile,
  ProfileResult,
  RegisteredWorkspace,
} from './types.js';

/**
 * 跨文档的规则：每条概念链接两端的 Workspace 都要已注册。
 * （Workspace id 不重复、链接本身的格式由 schema 检查。）
 *
 * @param profile - 要检查的 Profile
 */
export function crossDocumentIssues(profile: Profile): ProfileIssue[] {
  const registered = new Set(profile.workspaces.workspaces.map((w) => w.id));
  const issues: ProfileIssue[] = [];
  profile.conceptLinks.links.forEach((link, index) => {
    for (const end of ['from', 'to'] as const) {
      const ref = link[end];
      const { workspace } = parseGlobalConceptRef(ref);
      if (!registered.has(workspace)) {
        issues.push(
          profileIssue(
            'concept-links',
            'profile.link_workspace_not_registered',
            { ref, workspace },
            ['links', index, end],
          ),
        );
      }
    }
  });
  return issues;
}

/** 写入之后新出现的问题（原来就有的不算：写入不能让问题变多，但可以不修）。 */
export function newIssues(
  before: readonly ProfileIssue[],
  after: readonly ProfileIssue[],
): ProfileIssue[] {
  const key = (issue: ProfileIssue) =>
    `${issue.document} ${issue.code} ${JSON.stringify(issue.params)}`;
  const existing = new Set(before.map(key));
  return after.filter((issue) => !existing.has(key(issue)));
}

/** 注册一个 Workspace：id 不能已经注册。 */
export function registerWorkspace(
  profile: Profile,
  entry: RegisteredWorkspace,
): ProfileResult<Profile> {
  if (profile.workspaces.workspaces.some((w) => w.id === entry.id)) {
    return {
      ok: false,
      error: profileError('profile.workspace_already_registered', {
        id: entry.id,
      }),
    };
  }
  return {
    ok: true,
    value: {
      ...profile,
      workspaces: {
        ...profile.workspaces,
        workspaces: [...profile.workspaces.workspaces, entry],
      },
    },
  };
}

/** 注销一个 Workspace，同时删掉两端涉及它的概念链接。 */
export function unregisterWorkspace(
  profile: Profile,
  id: string,
): ProfileResult<{ profile: Profile; removedLinks: ConceptLink[] }> {
  if (!profile.workspaces.workspaces.some((w) => w.id === id)) {
    return {
      ok: false,
      error: profileError('profile.workspace_not_registered', { id }),
    };
  }
  const touches = (link: ConceptLink) =>
    parseGlobalConceptRef(link.from).workspace === id ||
    parseGlobalConceptRef(link.to).workspace === id;
  const removedLinks = profile.conceptLinks.links.filter(touches);
  return {
    ok: true,
    value: {
      removedLinks,
      profile: {
        ...profile,
        workspaces: {
          ...profile.workspaces,
          workspaces: profile.workspaces.workspaces.filter((w) => w.id !== id),
        },
        conceptLinks: {
          ...profile.conceptLinks,
          links: profile.conceptLinks.links.filter((link) => !touches(link)),
        },
      },
    },
  };
}

/** 替换全部概念链接（两端已注册的规则由写入时的检查保证）。 */
export function setConceptLinks(
  profile: Profile,
  links: readonly ConceptLink[],
): Profile {
  return {
    ...profile,
    conceptLinks: { ...profile.conceptLinks, links: [...links] },
  };
}
