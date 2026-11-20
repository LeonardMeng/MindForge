import type {
  IsoDateTime,
  MasteryChangeCause,
  MasteryState,
  Slug,
  Ulid,
} from '@mastery/schema';

/** 一条证据提交成功（已经写入）。 */
export interface EvidenceSubmitted {
  readonly type: 'evidence/submitted';
  readonly conceptId: Slug;
  readonly evidenceId: Ulid;
  readonly at: IsoDateTime;
}

/** 一个 Concept 的掌握度投影变了（已经写入）。 */
export interface MasteryChanged {
  readonly type: 'mastery/changed';
  readonly conceptId: Slug;
  /** 原来的状态；第一次算出投影时为 null。 */
  readonly from: MasteryState | null;
  readonly to: MasteryState;
  readonly rulesVersion: number;
  readonly cause: MasteryChangeCause;
}

/** 领域事件，按 `type` 区分。 */
export type DomainEvent = EvidenceSubmitted | MasteryChanged;

/**
 * 领域事件的出口（4.2 由 `plugin-core` 桥接到 Cordis 的 `ctx.emit`）。
 *
 * - **只在写入成功之后**发出。
 * - **事件可能丢失**：比如写入之后、发出之前进程崩溃了。所以事件只是通知，使用者（索引、UI、
 *   Git 提交）必须能根据文件重新对账，和 FileSystem 的 `watch` 一样。
 * - 监听者出错不影响操作：Core 用 {@link publish} 发出事件，`emit` 抛出的错误交给 `reportError`，
 *   不会改变操作的结果，也不会撤销已经完成的写入。
 */
export interface EventSink {
  emit(event: DomainEvent): void;
  /** `emit` 抛出错误时调用，用来记录。它自己抛出的错误也会被忽略。 */
  reportError(error: unknown, event: DomainEvent): void;
}

/**
 * 发出一个事件。`emit` 抛出时交给 `reportError`，自己从不抛出，所以不会影响已经完成的操作。
 *
 * @param sink - 事件出口
 * @param event - 要发出的事件
 */
export function publish(sink: EventSink, event: DomainEvent): void {
  try {
    sink.emit(event);
  } catch (error) {
    try {
      sink.reportError(error, event);
    } catch {
      // 报告也失败了：没有更多能做的，不能让它影响操作的结果。
    }
  }
}
