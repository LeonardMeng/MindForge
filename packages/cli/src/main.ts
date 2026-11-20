#!/usr/bin/env node
// `mastery` 命令的入口：从真实的进程环境构造 CliContext，然后运行。
import { homedir, hostname, userInfo } from 'node:os';
import { join } from 'node:path';

import { run } from './run.js';

const home = homedir();
const deviceDir = process.env.MASTERY_HOME ?? join(home, '.mastery');

let username = 'me';
try {
  username = userInfo().username;
} catch {
  // 某些环境里拿不到用户名（比如容器），用默认值。
}

process.exitCode = await run(process.argv.slice(2), {
  home,
  deviceDir,
  cwd: process.cwd(),
  stdout: process.stdout,
  stderr: process.stderr,
  hostname: hostname(),
  username,
  locale: Intl.DateTimeFormat().resolvedOptions().locale,
  platform: process.platform,
});
