import type { Clock } from '@mastery/platform';

import type { EventSink } from './events.js';
import type { Repository } from './repository.js';

/**
 * 掌握度规则（2.3 补全）。现在只有版本号：每个投影都记录算它用的 `rules_version`。
 */
export interface Rules {
  readonly version: number;
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
