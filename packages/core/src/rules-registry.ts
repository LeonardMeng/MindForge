import type { Rules, RulesRegistry } from './ports.js';

/**
 * 一个固定的规则表：`current` 是最大的版本。CLI 和 `plugin-core` 用它注册规则包（比如 `rulesV1`）；
 * `@mastery/core/testing` 也导出它。
 *
 * @param versions - 可用的规则（至少一个）
 */
export function createRulesRegistry(versions: readonly Rules[]): RulesRegistry {
  if (versions.length === 0)
    throw new Error('at least one rules version is required');
  const byVersion = new Map(versions.map((rules) => [rules.version, rules]));
  const latest = [...versions].sort(
    (a, b) => b.version - a.version,
  )[0] as Rules;
  return {
    get: (version) => byVersion.get(version) ?? null,
    current: () => latest,
  };
}
