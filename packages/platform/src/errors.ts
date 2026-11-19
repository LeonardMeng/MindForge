/** PlatformError 的参数：路径、原因等，用来生成提示文字。 */
export type PlatformErrorParams = Readonly<Record<string, string | number>>;

const text = (value: unknown): string => String(value);

/**
 * Platform 错误的消息表（目前只有英文）。错误码稳定，提示文字可以改，
 * 测试只断言错误码（ADR-0013）。
 */
const MESSAGES = {
  'platform.not_found': (p: PlatformErrorParams) =>
    `"${text(p.path)}" does not exist`,
  'platform.already_exists': (p: PlatformErrorParams) =>
    `"${text(p.path)}" already exists`,
  'platform.not_a_directory': (p: PlatformErrorParams) =>
    `"${text(p.path)}" is not a directory`,
  'platform.is_a_directory': (p: PlatformErrorParams) =>
    `"${text(p.path)}" is a directory`,
  'platform.not_empty': (p: PlatformErrorParams) =>
    `directory "${text(p.path)}" is not empty; remove it with recursive: true`,
  'platform.invalid_path': (p: PlatformErrorParams) =>
    `"${text(p.path)}" is not a valid path (${text(p.reason)})`,
  'platform.invalid_encoding': (p: PlatformErrorParams) =>
    `"${text(p.path)}" is not valid UTF-8 text`,
  'platform.permission_denied': (p: PlatformErrorParams) =>
    `permission denied for "${text(p.path)}"`,
  'platform.lock_timeout': (p: PlatformErrorParams) =>
    `timed out after ${text(p.timeoutMs)} ms waiting for lock "${text(p.name)}"`,
  'platform.io': (p: PlatformErrorParams) =>
    `I/O error at "${text(p.path)}": ${text(p.detail)}`,
} as const;

/** Platform 错误的错误码。 */
export type PlatformErrorCode = keyof typeof MESSAGES;

/** 所有 Platform 错误码。 */
export const PLATFORM_ERROR_CODES = Object.keys(
  MESSAGES,
) as readonly PlatformErrorCode[];

/**
 * 所有 Platform 实现在出错时抛出的错误，带稳定的错误码（`platform.*`）和参数。
 */
export class PlatformError extends Error {
  override readonly name = 'PlatformError';

  /**
   * @param code - 稳定的错误码
   * @param params - 路径、原因等参数
   */
  constructor(
    readonly code: PlatformErrorCode,
    readonly params: PlatformErrorParams = {},
  ) {
    super(MESSAGES[code](params));
  }
}

/**
 * 判断一个值是不是 {@link PlatformError}，可以同时检查错误码。
 *
 * @param error - 任意值
 * @param code - 要求的错误码（可选）
 */
export function isPlatformError(
  error: unknown,
  code?: PlatformErrorCode,
): error is PlatformError {
  return (
    error instanceof PlatformError &&
    (code === undefined || error.code === code)
  );
}
