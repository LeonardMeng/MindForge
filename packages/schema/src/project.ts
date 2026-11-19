import { z } from 'zod';

import { listOf, NonEmptyString } from './fields.js';
import { schemaVersionOf } from './versions.js';
import { Slug } from './ids.js';

/** Project 的状态。 */
export const ProjectStatus = z.enum([
  'active',
  'paused',
  'completed',
  'archived',
]);
/** Project 的状态。 */
export type ProjectStatus = z.infer<typeof ProjectStatus>;

/**
 * `projects/<slug>/project.yaml`：Workspace 里的一个具体学习或研究目标。
 *
 * `concepts` 是这个 Project 关注的 Concept 的 slug，可以是 `[]`，不能重复；
 * 这些 slug 是否存在由 `mastery validate` 检查。需要更多字段时通过 `schema_version` 扩展。
 */
export const ProjectConfig = z.strictObject({
  schema_version: schemaVersionOf('project'),
  id: Slug,
  name: NonEmptyString,
  description: NonEmptyString.optional(),
  status: ProjectStatus,
  concepts: listOf('concepts', Slug),
});
/** `project.yaml` 的内容。 */
export type ProjectConfig = z.infer<typeof ProjectConfig>;
