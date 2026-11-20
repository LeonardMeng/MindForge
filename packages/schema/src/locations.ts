// 本包内部：本机路径、Git 远程地址和服务地址的规则。不从 index.ts 导出。
import { z } from 'zod';

import { LOCAL_PATH_PATTERN, patternMeta } from './constraints.js';
import { pushIssue } from './errors.js';
import { NonEmptyString } from './fields.js';

/** `scheme://[userinfo@]host[:port][/path…]`。 */
const URL_PATTERN =
  /^([a-z][a-z0-9+.-]*):\/\/(?:([^@/?#]*)@)?([^/?#:@\s]+)(?::(\d+))?(?:[/?#]\S*)?$/i;

/** scp 风格的 Git 地址：`[user@]host:path`。主机名至少两个字符，避免和 Windows 盘符混淆。 */
const SCP_PATTERN = /^(?:[^@:/\s]+@)?[A-Za-z0-9.-]{2,}:(?!\/\/)\S+$/;

/** 看起来是本机路径：绝对路径、`~`、相对路径、Windows 盘符、UNC 或 `file:`。 */
const LOCAL_PATTERN = /^(?:\/|~|\.|\\\\|[A-Za-z]:(?:[\\/]|$)|file:)/i;

const CONTROL_CHARACTERS = /\p{Cc}/u;

interface ParsedUrl {
  readonly scheme: string;
  readonly userinfo: string | undefined;
}

function parseUrl(value: string): ParsedUrl | null {
  const match = URL_PATTERN.exec(value);
  if (match === null) return null;
  return { scheme: (match[1] ?? '').toLowerCase(), userinfo: match[2] };
}

/**
 * 本机的绝对路径：`/…`、`~` 或 `~/…`、`C:\…` 或 `C:/…`、`\\server\share`。
 * 只用于 `device.yaml`（路径每台设备都不同，不进 Profile）。
 */
export const LocalPath = NonEmptyString.check((ctx) => {
  if (
    !LOCAL_PATH_PATTERN.test(ctx.value) ||
    CONTROL_CHARACTERS.test(ctx.value)
  ) {
    pushIssue(ctx, 'local_path.not_absolute', { value: ctx.value });
  }
}).meta(patternMeta(LOCAL_PATH_PATTERN));

/**
 * Git 远程地址（`workspaces.yaml`）：`[user@]host:path`、`ssh://`、`git://`、`http(s)://`。
 *
 * - 不能是本机路径（Profile 会同步到别的设备，路径在那里没有意义）：`remote.local_path`。
 * - `http(s)://` 不能带任何用户信息（`https://ghp_…@github.com/…` 是 token 泄露最常见的写法），
 *   `ssh://` 只能带用户名、不能带密码：`secret.credentials_in_url`。
 */
export const GitRemote = z.string().check((ctx) => {
  const value = ctx.value;
  if (value === '' || /\s/.test(value)) {
    pushIssue(ctx, 'remote.invalid', { value });
    return;
  }
  if (LOCAL_PATTERN.test(value)) {
    pushIssue(ctx, 'remote.local_path', { value });
    return;
  }
  const url = parseUrl(value);
  if (url !== null) {
    if (url.scheme === 'http' || url.scheme === 'https') {
      if (url.userinfo !== undefined)
        pushIssue(ctx, 'secret.credentials_in_url', {});
    } else if (url.scheme === 'ssh' || url.scheme === 'git') {
      if (url.userinfo?.includes(':') === true) {
        pushIssue(ctx, 'secret.credentials_in_url', {});
      }
    } else {
      pushIssue(ctx, 'remote.invalid', { value });
    }
    return;
  }
  if (value.includes('://') || !SCP_PATTERN.test(value)) {
    pushIssue(ctx, 'remote.invalid', { value });
  }
});

/** 服务地址：`http(s)://host[:port][/…]`，不能带用户信息。 */
export const Endpoint = z.string().check((ctx) => {
  const url = parseUrl(ctx.value);
  if (url === null || (url.scheme !== 'http' && url.scheme !== 'https')) {
    pushIssue(ctx, 'endpoint.invalid', { value: ctx.value });
  } else if (url.userinfo !== undefined) {
    pushIssue(ctx, 'secret.credentials_in_url', {});
  }
});
