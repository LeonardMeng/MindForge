import type {
  IsoDateTime,
  MasteryProjection,
  MasteryState,
} from '@mastery/schema';

/** 一个投影在某个时刻的复习状态（2.7）。 */
export interface ReviewStatus {
  /** 投影里保存的下次复习时刻；不是 `mastered` 时为 null。 */
  readonly dueAt: IsoDateTime | null;
  /** 到期了没有：`mastered`，而且 `now` 不早于 `dueAt`。 */
  readonly due: boolean;
  /** 读取时的状态：到期的 `mastered` 是 `needs_review`，其余就是保存的状态。 */
  readonly effectiveState: MasteryState;
}

/**
 * 根据当前时间推导一个投影的复习状态（2.7）。纯函数。
 *
 * 到期不写进保存的投影：保存的状态只由证据决定（不变量 3），保存的 `needs_review` 只来自证据
 * （从 `mastered` 退步）。“到期的 `mastered` 转为 `needs_review`”只在读取时成立，status、UI、
 * Supervisor 和 `prerequisiteRisks` 都用这个函数。
 *
 * @param projection - 保存的投影（只用 `state` 和 `review_due_at`）
 * @param now - 当前时间（`clock.now()`）
 */
export function reviewStatus(
  projection: Pick<MasteryProjection, 'state' | 'review_due_at'>,
  now: IsoDateTime,
): ReviewStatus {
  const dueAt =
    projection.state === 'mastered' ? projection.review_due_at : null;
  // IsoDateTime 只有一种写法（ADR-0013），可以按字符串比较先后。
  const due = dueAt !== null && now >= dueAt;
  return {
    dueAt,
    due,
    effectiveState: due ? 'needs_review' : projection.state,
  };
}
