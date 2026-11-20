import type { IsoDateTime, MasteryState } from '@mastery/schema';

import {
  coreError,
  type ConceptNotFound,
  type ConceptUnreadable,
} from './errors.js';
import type { Ports } from './ports.js';
import { err, ok, type Result } from './result.js';
import { reviewStatus } from './review.js';

/** 算作风险的掌握状态（ROADMAP 2.6）。 */
export const RISKY_STATES: readonly MasteryState[] = [
  'not_assessed',
  'diagnosed',
  'learning',
  'needs_review',
];

/** 为什么这个前置 Concept 是风险。 */
export type PrerequisiteRiskReason =
  /** 掌握状态有风险（没有投影算作 `not_assessed`）。 */
  | { readonly kind: 'state'; readonly state: MasteryState }
  /** 引用的 Concept 不存在（`mastery validate` 报错误）。 */
  | { readonly kind: 'concept_missing' }
  /** Concept 文件读不了：不知道它自己的前置依赖，不再往下找。 */
  | { readonly kind: 'concept_unreadable' }
  /** 投影读不了；`tooNew` 表示是更新版本写的。 */
  | { readonly kind: 'mastery_unreadable'; readonly tooNew: boolean }
  /** `mastered`，但已经到了复习的时刻（2.7）。 */
  | { readonly kind: 'review_due'; readonly dueAt: IsoDateTime };

/** 一个有风险的前置 Concept。 */
export interface PrerequisiteRisk {
  readonly conceptId: string;
  /** 1 表示直接的前置依赖。 */
  readonly depth: number;
  /** 从被查询的 Concept 到它之间经过的 Concept（不含两端），长度是 `depth - 1`。 */
  readonly via: readonly string[];
  readonly reason: PrerequisiteRiskReason;
}

/** {@link prerequisiteRisks} 可能返回的错误。 */
export type PrerequisiteRisksError = ConceptNotFound | ConceptUnreadable;

const compareSlugs = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** 按字典序比较两条路径。 */
function comparePaths(a: readonly string[], b: readonly string[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const order = compareSlugs(a[i] as string, b[i] as string);
    if (order !== 0) return order;
  }
  return a.length - b.length;
}

interface Node {
  readonly conceptId: string;
  /** 从被查询的 Concept 到这个节点的路径（不含被查询的 Concept，含这个节点）。 */
  readonly path: readonly string[];
}

/**
 * 找出一个 Concept 的前置依赖里有风险的 Concept（ROADMAP 2.6）。只读，不写文件、不发事件。
 *
 * - **传递的**：按广度优先沿前置依赖往下找，每个 Concept 只报一次，用最短的路径；同样长的路径按
 *   slug 的字典序取第一条。结果按 `(depth, conceptId)` 排序。有环时（`mastery validate` 会报）也会停下。
 * - **风险**：状态是 `not_assessed`、`diagnosed`、`learning` 或 `needs_review`（没有投影算作
 *   `not_assessed`）；`mastered` 但已经到期复习（`review_due`，按 `clock.now()` 判断，2.7）；引用的
 *   Concept 不存在；Concept 文件或投影读不了。
 * - **剪枝**：状态是 `provisional_mastery` 或（没到期的）`mastered` 的前置 Concept 不报，也**不往下找**：
 *   已经验证过的掌握，说明它自己的基础是够的；不剪枝的话，图越大结果里的噪音越多。它下面的 Concept
 *   如果还能通过别的、没被剪掉的路径到达，照样会报（用这些路径里最短的一条）。只在安全的状态剪枝，
 *   有风险的、读不了投影的节点照样往下找；Concept 文件读不了或不存在时无法往下找。
 * - **新鲜度**：状态来自保存的投影（`mastery/<slug>.yaml`），所以结果只和投影一样新；`recalculate`
 *   和启动时的对账（3.x）负责让投影保持最新。是否到期复习在读取时按 `clock.now()` 判断。
 *
 * 被查询的 Concept 本身不存在或读不了时返回错误。I/O 错误照常抛出。
 *
 * @param ports - Core 的端口（只用 `repository` 和 `clock`）
 * @param conceptId - 被查询的 Concept 的 slug
 */
export async function prerequisiteRisks(
  ports: Pick<Ports, 'repository' | 'clock'>,
  conceptId: string,
): Promise<Result<PrerequisiteRisk[], PrerequisiteRisksError>> {
  const { repository } = ports;
  const now = ports.clock.now();
  const root = await repository.getConcept(conceptId);
  if (root.kind === 'missing') {
    return err(coreError('core.concept_not_found', { concept_id: conceptId }));
  }
  if (root.kind === 'unreadable') {
    return err(
      coreError(
        'core.concept_unreadable',
        { concept_id: conceptId },
        root.issues,
      ),
    );
  }

  const risks: PrerequisiteRisk[] = [];
  const seen = new Set<string>([conceptId]);
  const discover = (
    parentPath: readonly string[],
    prerequisites: readonly string[],
  ) =>
    [...prerequisites]
      .sort(compareSlugs)
      .filter((id) => !seen.has(id))
      .map((id): Node => {
        seen.add(id);
        return { conceptId: id, path: [...parentPath, id] };
      });

  let level = discover([], root.value.prerequisites);
  while (level.length > 0) {
    const next: Node[] = [];
    // 同一层按路径的字典序处理，所以下一层的 Concept 取到的是字典序最小的最短路径。
    for (const node of [...level].sort((a, b) =>
      comparePaths(a.path, b.path),
    )) {
      const report = (reason: PrerequisiteRiskReason) =>
        risks.push({
          conceptId: node.conceptId,
          depth: node.path.length,
          via: node.path.slice(0, -1),
          reason,
        });

      const concept = await repository.getConcept(node.conceptId);
      if (concept.kind === 'missing') {
        report({ kind: 'concept_missing' });
        continue;
      }
      if (concept.kind === 'unreadable') {
        report({ kind: 'concept_unreadable' });
        continue;
      }

      const mastery = await repository.getMastery(node.conceptId);
      if (mastery.kind === 'unreadable') {
        report({ kind: 'mastery_unreadable', tooNew: mastery.tooNew });
      } else if (mastery.kind === 'missing') {
        report({ kind: 'state', state: 'not_assessed' });
      } else {
        const review = reviewStatus(mastery.value, now);
        if (review.due && review.dueAt !== null) {
          // 到期的 mastered：是风险，不剪枝。
          report({ kind: 'review_due', dueAt: review.dueAt });
        } else if (RISKY_STATES.includes(mastery.value.state)) {
          report({ kind: 'state', state: mastery.value.state });
        } else {
          // 剪枝：安全的状态不报，也不往下找。
          continue;
        }
      }
      next.push(...discover(node.path, concept.value.prerequisites));
    }
    level = next;
  }

  risks.sort(
    (a, b) => a.depth - b.depth || compareSlugs(a.conceptId, b.conceptId),
  );
  return ok(risks);
}
