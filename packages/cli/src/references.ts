/**
 * `mastery validate` 的引用检查：单个文件的校验由 store 做，这里检查文件之间的引用。
 * 纯函数，不做 I/O。
 */

/** 引用检查的输入：从 Workspace 里读出的、已经通过单文件校验的内容。 */
export interface WorkspaceContents {
  /** Concept slug → 前置依赖。 */
  readonly concepts: ReadonlyMap<string, readonly string[]>;
  /** Project id → 关注的 Concept。 */
  readonly projects: ReadonlyMap<string, readonly string[]>;
  /** 有评测标准的 Concept（`assessments/<slug>/criteria.yaml`）。 */
  readonly criteria: readonly string[];
  /** 评测会话：`[Concept slug, 会话 id]`。 */
  readonly sessions: readonly (readonly [string, string])[];
  /** 证据：Concept slug、证据 id、会话 id（手动录入时为 null）。 */
  readonly evidence: readonly {
    readonly concept: string;
    readonly id: string;
    readonly session: string | null;
  }[];
  /** 有掌握度投影或历史的 Concept。 */
  readonly mastery: readonly {
    readonly concept: string;
    readonly file: string;
  }[];
  readonly blindspots: readonly {
    readonly id: string;
    readonly concept: string;
    readonly prerequisite: string | null;
    readonly mergedInto: string | null;
  }[];
  readonly interventions: readonly {
    readonly id: string;
    readonly blindspot: string;
  }[];
}

/** 一个引用问题。 */
export interface ReferenceIssue {
  readonly file: string;
  readonly code: string;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

/**
 * 前置依赖的环。每个强连通分量报一次：从分量里最小的 slug 出发，按 slug 顺序找到回到起点的一条路径。
 *
 * @param graph - Concept slug → 前置依赖（只包含存在的 Concept）
 * @returns 每个环的路径，比如 `['a', 'b', 'a']`，按起点排序
 */
export function findCycles(
  graph: ReadonlyMap<string, readonly string[]>,
): string[][] {
  const nodes = [...graph.keys()].sort();
  const next = (node: string) =>
    [...(graph.get(node) ?? [])].filter((n) => graph.has(n)).sort();

  // Tarjan 求强连通分量。
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  const visit = (node: string): void => {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);
    for (const target of next(node)) {
      if (!index.has(target)) {
        visit(target);
        low.set(node, Math.min(low.get(node) ?? 0, low.get(target) ?? 0));
      } else if (onStack.has(target)) {
        low.set(node, Math.min(low.get(node) ?? 0, index.get(target) ?? 0));
      }
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      let member: string | undefined;
      do {
        member = stack.pop();
        if (member === undefined) break;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      components.push(component);
    }
  };
  for (const node of nodes) if (!index.has(node)) visit(node);

  const cycles: string[][] = [];
  for (const component of components) {
    const members = new Set(component);
    const start = [...members].sort()[0];
    if (start === undefined) continue;
    if (members.size === 1 && !next(start).includes(start)) continue;
    // 在分量里从 start 出发，按 slug 顺序深度优先，找到回到 start 的路径。
    const path: string[] = [start];
    const seen = new Set<string>([start]);
    const search = (node: string): boolean => {
      for (const target of next(node)) {
        if (!members.has(target)) continue;
        if (target === start) {
          path.push(start);
          return true;
        }
        if (seen.has(target)) continue;
        seen.add(target);
        path.push(target);
        if (search(target)) return true;
        path.pop();
      }
      return false;
    };
    if (search(start)) cycles.push(path);
  }
  return cycles.sort((a, b) => ((a[0] ?? '') < (b[0] ?? '') ? -1 : 1));
}

/**
 * 检查文件之间的引用。
 *
 * @param contents - 通过单文件校验的内容
 */
export function checkReferences(contents: WorkspaceContents): ReferenceIssue[] {
  const issues: ReferenceIssue[] = [];
  const concepts = contents.concepts;
  const issue = (
    file: string,
    code: string,
    path: readonly (string | number)[],
    message: string,
  ) => issues.push({ file, code, path, message });

  for (const [slug, prerequisites] of [...concepts].sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    prerequisites.forEach((prerequisite, index) => {
      if (!concepts.has(prerequisite)) {
        issue(
          `concepts/${slug}.md`,
          'reference.prerequisite_missing',
          ['frontmatter', 'prerequisites', index],
          `prerequisite "${prerequisite}" is not a concept in this workspace`,
        );
      }
    });
  }
  for (const cycle of findCycles(concepts)) {
    issue(
      `concepts/${cycle[0] ?? ''}.md`,
      'reference.prerequisite_cycle',
      ['frontmatter', 'prerequisites'],
      `prerequisites form a cycle: ${cycle.join(' → ')}`,
    );
  }
  for (const [id, list] of contents.projects) {
    list.forEach((concept, index) => {
      if (!concepts.has(concept)) {
        issue(
          `projects/${id}/project.yaml`,
          'reference.concept_missing',
          ['concepts', index],
          `concept "${concept}" does not exist`,
        );
      }
    });
  }
  for (const concept of contents.criteria) {
    if (!concepts.has(concept)) {
      issue(
        `assessments/${concept}/criteria.yaml`,
        'reference.concept_missing',
        ['concept_id'],
        `concept "${concept}" does not exist`,
      );
    }
  }
  const sessions = new Set(contents.sessions.map(([, id]) => id));
  for (const [concept, id] of contents.sessions) {
    if (!concepts.has(concept)) {
      issue(
        `assessments/${concept}/sessions/${id}.json`,
        'reference.concept_missing',
        ['concept_id'],
        `concept "${concept}" does not exist`,
      );
    }
  }
  for (const evidence of contents.evidence) {
    const file = `evidence/${evidence.concept}/${evidence.id}.json`;
    if (!concepts.has(evidence.concept)) {
      issue(
        file,
        'reference.concept_missing',
        ['concept_id'],
        `concept "${evidence.concept}" does not exist`,
      );
    }
    if (evidence.session !== null && !sessions.has(evidence.session)) {
      issue(
        file,
        'reference.session_missing',
        ['session_id'],
        `session "${evidence.session}" does not exist`,
      );
    }
  }
  for (const { concept, file } of contents.mastery) {
    if (!concepts.has(concept)) {
      issue(
        file,
        'reference.concept_missing',
        ['concept_id'],
        `concept "${concept}" does not exist`,
      );
    }
  }
  const blindspots = new Set(contents.blindspots.map((b) => b.id));
  for (const blindspot of contents.blindspots) {
    const file = `blindspots/${blindspot.id}.yaml`;
    if (!concepts.has(blindspot.concept)) {
      issue(
        file,
        'reference.concept_missing',
        ['concept_id'],
        `concept "${blindspot.concept}" does not exist`,
      );
    }
    if (
      blindspot.prerequisite !== null &&
      !concepts.has(blindspot.prerequisite)
    ) {
      issue(
        file,
        'reference.concept_missing',
        ['prerequisite_id'],
        `concept "${blindspot.prerequisite}" does not exist`,
      );
    }
    if (
      blindspot.mergedInto !== null &&
      !blindspots.has(blindspot.mergedInto)
    ) {
      issue(
        file,
        'reference.blindspot_missing',
        ['merged_into'],
        `blindspot "${blindspot.mergedInto}" does not exist`,
      );
    }
  }
  for (const intervention of contents.interventions) {
    if (!blindspots.has(intervention.blindspot)) {
      issue(
        `interventions/${intervention.id}.yaml`,
        'reference.blindspot_missing',
        ['blindspot_id'],
        `blindspot "${intervention.blindspot}" does not exist`,
      );
    }
  }
  return issues;
}
