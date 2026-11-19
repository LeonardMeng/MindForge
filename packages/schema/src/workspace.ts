import { z } from 'zod';

import {
  patternMeta,
  PLUGIN_NAME_PATTERN,
  SLUG_MAX_LENGTH,
} from './constraints.js';
import { pushIssue } from './errors.js';
import { isPlainObject, NonEmptyString } from './fields.js';
import { schemaVersionOf } from './versions.js';
import { Slug } from './ids.js';

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
        bareName.length > SLUG_MAX_LENGTH
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
  .pipe(
    z.record(
      // 插件名的长度上限（不含 `~`）JSON Schema 表达不了，写在说明页里。
      z.string().meta(patternMeta(PLUGIN_NAME_PATTERN)),
      z.looseObject({}),
    ),
  );

/**
 * `workspace.yaml`：一个 Workspace 的配置。
 *
 * SuperAgent 也是普通插件（比如 `superagent-default`），写在 `plugins` 里，没有单独的字段。
 */
export const WorkspaceConfig = z.strictObject({
  schema_version: schemaVersionOf('workspace'),
  /** Workspace 的 id，也是全局引用 `<id>:<slug>` 的前缀。 */
  id: Slug,
  name: NonEmptyString,
  description: NonEmptyString.optional(),
  plugins: Plugins,
});
/** `workspace.yaml` 的内容。 */
export type WorkspaceConfig = z.infer<typeof WorkspaceConfig>;
