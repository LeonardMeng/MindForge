import { z } from 'zod';

import { pushIssue } from './errors.js';
import { NonEmptyString, SchemaVersionV1 } from './fields.js';
import { Slug } from './ids.js';

/** 插件名：Slug 规则，前面可以加 `~` 表示禁用。 */
const PLUGIN_NAME_PATTERN = /^~?[a-z0-9]+(-[a-z0-9]+)*$/;
/** 插件名（不含 `~`）的最大长度，和 Slug 一致。 */
const PLUGIN_NAME_MAX_LENGTH = 64;

function isPlainObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `plugins`：插件名 → 插件配置对象。
 *
 * 只校验这一层的结构，配置对象的内容由各个插件自己的 schema 校验（4.3），这里原样保留。
 * 没有配置的插件写 `{}`，不能写 `null`；同一个插件不能同时以 `x` 和 `~x` 出现。
 */
const Plugins = z
  .record(z.string(), z.unknown())
  .check((ctx) => {
    const names = Object.keys(ctx.value);
    for (const name of names) {
      const value = ctx.value[name];
      const bareName = name.startsWith('~') ? name.slice(1) : name;
      if (
        !PLUGIN_NAME_PATTERN.test(name) ||
        bareName.length > PLUGIN_NAME_MAX_LENGTH
      ) {
        pushIssue(ctx, 'workspace.invalid_plugin_name', { name }, [name]);
      } else if (value === null) {
        pushIssue(ctx, 'workspace.plugin_config_null', { name }, [name]);
      } else if (!isPlainObject(value)) {
        pushIssue(
          ctx,
          'field.invalid_type',
          {
            expected: 'object',
            received: Array.isArray(value) ? 'array' : typeof value,
          },
          [name],
        );
      }
      if (name.startsWith('~') && names.includes(bareName)) {
        pushIssue(ctx, 'workspace.plugin_conflict', { name: bareName }, [name]);
      }
    }
  })
  .pipe(z.record(z.string(), z.looseObject({})));

/**
 * `workspace.yaml`：一个 Workspace 的配置。
 *
 * SuperAgent 也是普通插件（比如 `superagent-default`），写在 `plugins` 里，没有单独的字段。
 */
export const WorkspaceConfig = z.strictObject({
  schema_version: SchemaVersionV1,
  /** Workspace 的 id，也是全局引用 `<id>:<slug>` 的前缀。 */
  id: Slug,
  name: NonEmptyString,
  description: NonEmptyString.optional(),
  plugins: Plugins,
});
/** `workspace.yaml` 的内容。 */
export type WorkspaceConfig = z.infer<typeof WorkspaceConfig>;
