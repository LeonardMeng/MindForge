import { PlatformError, type PlatformErrorCode } from '@mastery/platform';

/** Node 的 errno 对应的 Platform 错误码。表里没有的一律报 `platform.io`。 */
const ERRNO_CODES: Readonly<Record<string, PlatformErrorCode>> = {
  ENOENT: 'platform.not_found',
  EEXIST: 'platform.already_exists',
  ENOTDIR: 'platform.not_a_directory',
  EISDIR: 'platform.is_a_directory',
  ENOTEMPTY: 'platform.not_empty',
  EACCES: 'platform.permission_denied',
  EPERM: 'platform.permission_denied',
};

/** Node 抛出的系统错误的 errno（比如 `ENOENT`）；不是系统错误时返回 undefined。 */
export function errnoOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error))
    return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

/**
 * 把 Node 的错误转换成 {@link PlatformError}。已经是 PlatformError 的原样返回。
 *
 * @param error - 捕获到的错误
 * @param path - 相对于根目录的路径，写进错误参数
 */
export function toPlatformError(error: unknown, path: string): PlatformError {
  if (error instanceof PlatformError) return error;
  const errno = errnoOf(error);
  const code =
    (errno !== undefined ? ERRNO_CODES[errno] : undefined) ?? 'platform.io';
  const detail = error instanceof Error ? error.message : String(error);
  return new PlatformError(
    code,
    code === 'platform.io' ? { path, detail } : { path },
  );
}
