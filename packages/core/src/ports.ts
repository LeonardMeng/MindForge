import type { Clock } from '@mastery/platform';
import type { Dimension, DimensionScores, Evidence } from '@mastery/schema';

import type { EventSink } from './events.js';
import type { Repository } from './repository.js';

/** 一个维度的聚合结果。 */
export interface DimensionAggregate {
  /** 加权平均分，`0..1`。 */
  readonly score: number;
  /** 这个维度的置信度，`0..1`。 */
  readonly confidence: number;
  /** 给这个维度打了分（不是 `null`）的证据条数。 */
  readonly evidenceCount: number;
}

/** 一组证据的维度聚合结果（不含状态，状态在 2.4）。 */
export interface Aggregate {
  /** 每个维度的分数；没有任何证据给它打分时为 `null`（不变量 5）。 */
  readonly dimensions: DimensionScores;
  /** 总的置信度，`0..1`；没有证据时为 0。 */
  readonly confidence: number;
  /** 每个维度的细节，2.4 写 explanation 时用；没有分数的维度为 `null`。 */
  readonly perDimension: Readonly<Record<Dimension, DimensionAggregate | null>>;
}

/**
 * 掌握度规则（规则包实现，比如 `rules-v1`）。每个投影都记录算它用的 `rules_version`。
 * 2.4 再加状态机。
 */
export interface Rules {
  readonly version: number;
  /**
   * 聚合一组证据的维度分数和置信度。必须是纯函数：不读时钟、不做 I/O，证据的顺序不影响结果，
   * 同样的输入逐字节相同（不变量 3）。
   *
   * @param evidence - 一个 Concept 的证据（任意顺序）
   */
  aggregate(evidence: readonly Evidence[]): Aggregate;
}

/** 可用的规则版本。 */
export interface RulesRegistry {
  /** 指定版本的规则；不存在时返回 null（Core 报 `core.rules_version_unknown`）。 */
  get(version: number): Rules | null;
  /** 新的投影用的规则。 */
  current(): Rules;
}

/**
 * Core 需要的全部端口。Core 是纯 TypeScript：不依赖 Cordis，不做 I/O，时间只通过 Clock 传入
 * （不变量 3、8）。CLI 和 `plugin-core` 负责把它们接上。
 */
export interface Ports {
  readonly repository: Repository;
  /** `@mastery/platform` 的 Clock（只用类型）。 */
  readonly clock: Clock;
  readonly events: EventSink;
  readonly rules: RulesRegistry;
}
