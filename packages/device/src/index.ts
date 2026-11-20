/**
 * @packageDocumentation
 * 设备配置（ROADMAP 1.14）：读写 `~/.mastery/device.yaml`，首次运行生成设备 ULID，丢失后根据 Profile
 * 重新生成，计算每个 Workspace 在这台设备上的状态；`SecretStore` 端口（系统钥匙串）和内存实现。
 *
 * 依赖：schema、platform、store（用 store 的 `yamlFile` 读写 YAML，规则和 Workspace 的文件一样）。
 */
export {
  checkDeviceLocation,
  DEFAULT_MAX_CACHE_MB,
  DEFAULT_SYNC,
  DEVICE_FILE,
  DEVICE_GITIGNORE,
  ensureDeviceGitignore,
  initDevice,
  loadDevice,
  regenerateDevice,
  saveDevice,
  workspaceStates,
  type DeviceError,
  type DeviceErrorCode,
  type DeviceLocationIssue,
  type DeviceResult,
  type LoadedDevice,
  type NewDevice,
  type RegeneratedDevice,
  type WorkspaceState,
  type WorkspaceStatus,
} from './device.js';
export {
  MemorySecretStore,
  SECRET_NAME_PATTERN,
  SecretStoreError,
  type SecretStore,
  type SecretStoreErrorCode,
} from './secrets.js';
