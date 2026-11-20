import { z } from 'zod';

import { INTERVAL_MINUTES_RANGE, MAX_CACHE_MB_RANGE } from './constraints.js';
import { pushIssue } from './errors.js';
import {
  forwardIssues,
  integerIn,
  NonEmptyString,
  taggedUnion,
} from './fields.js';
import { Slug, Ulid } from './ids.js';
import { Endpoint, LocalPath } from './locations.js';
import { noSecrets } from './secrets.js';
import { schemaVersionOf } from './versions.js';

/** 设备的平台。 */
export const DevicePlatform = z.enum([
  'macos',
  'windows',
  'linux',
  'ios',
  'android',
]);
/** 设备的平台。 */
export type DevicePlatform = z.infer<typeof DevicePlatform>;

/** Workspace 在这台设备上的同步方式：什么时候拉取更新。`on-demand` 表示用到时才拉取；它不表示 Workspace 在不在本机。 */
export const WorkspaceSync = z.enum(['auto', 'manual', 'on-demand']);
/** Workspace 在这台设备上的同步方式。 */
export type WorkspaceSync = z.infer<typeof WorkspaceSync>;

/** 拉取方式：完整克隆，或只拉文本（资源文件按需下载）。必须写出来。 */
export const WorkspaceCheckout = z.enum(['full', 'text-only']);
/** 拉取方式。 */
export type WorkspaceCheckout = z.infer<typeof WorkspaceCheckout>;

const GitProfileStore = z.strictObject({
  store: z.literal('git'),
  /** Profile 仓库在本机的位置。 */
  path: LocalPath,
});

const CloudProfileStore = z.strictObject({
  store: z.literal('cloud'),
  endpoint: Endpoint,
  /** 云端 Profile 的本地完整副本（不变量 11）。 */
  cache_path: LocalPath,
});

/**
 * Profile 存在哪里。`cloud` 的格式已经定下，但 1.14 在 9.7 实现之前会明确拒绝它（“暂不支持”）。
 */
const DeviceProfile = taggedUnion(
  'store',
  { git: GitProfileStore, cloud: CloudProfileStore },
  z.discriminatedUnion('store', [GitProfileStore, CloudProfileStore]),
);

const DeviceWorkspace = z.strictObject({
  path: LocalPath,
  sync: WorkspaceSync,
  checkout: WorkspaceCheckout,
});

const DeviceModels = z
  .strictObject({
    /** 本机的模型运行时（slug，比如 `ollama`）；没有时为 `null`。 */
    local_runtime: Slug.nullable(),
    /** 运行时的地址；和 `local_runtime` 同时有值或同时为 `null`。 */
    local_endpoint: Endpoint.nullable(),
  })
  .check((ctx) => {
    if (
      (ctx.value.local_runtime === null) !==
      (ctx.value.local_endpoint === null)
    ) {
      pushIssue(ctx, 'device.models_incomplete', {});
    }
  });

/**
 * `~/.mastery/device.yaml`：只属于这台设备的配置。不提交、不同步（不变量 13）。
 *
 * **不能有密钥**：看起来像密钥的字段（`api_key`、`token`、`password`、`secret` 等）和常见格式的
 * token 都报 `secret.*`。这只是一道保险，真正的规则是密钥只放在系统钥匙串里。
 */
export const DeviceConfig = noSecrets(
  z.strictObject({
    schema_version: schemaVersionOf('device'),
    device: z.strictObject({
      /** 首次启动时生成，之后不变。 */
      id: Ulid,
      /** 显示用，可以修改。 */
      name: NonEmptyString,
      platform: DevicePlatform,
    }),
    profile: DeviceProfile,
    /** Workspace id → 它在这台设备上的位置和同步方式。 */
    workspaces: z.record(z.string(), DeviceWorkspace).check((ctx) => {
      // 键自己校验，这样错误码是 Slug 的（比如 slug.invalid_format），而不是 zod 包装过的 field.invalid。
      for (const key of Object.keys(ctx.value)) {
        const result = Slug.safeParse(key, { reportInput: true });
        if (!result.success) forwardIssues(ctx, result.error.issues, [key]);
      }
    }),
    sync: z.strictObject({
      /** 计费网络下是否同步。 */
      on_metered_network: z.boolean(),
      interval_minutes: integerIn(INTERVAL_MINUTES_RANGE),
    }),
    storage: z.strictObject({
      /** 外部资源文件的本地存放位置（不通过符号链接，见 1.8）。 */
      resources_dir: LocalPath,
      max_cache_mb: integerIn(MAX_CACHE_MB_RANGE),
    }),
    models: DeviceModels,
  }),
);
/** `device.yaml` 的内容。 */
export type DeviceConfig = z.infer<typeof DeviceConfig>;
