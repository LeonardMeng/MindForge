/**
 * @packageDocumentation
 * `mastery` 命令（ROADMAP 1.15）：`profile init`、`profile show`、`init`、`validate`。
 * 命令行入口是 `main.ts`；这里导出 {@link run}，测试在同一个进程里运行命令。
 */
export { run, HELP } from './run.js';
export {
  validateWorkspace,
  type ValidationEntry,
  type ValidationReport,
} from './commands/validate.js';
export {
  checkReferences,
  findCycles,
  type WorkspaceContents,
  type ReferenceIssue,
} from './references.js';
export {
  EXIT,
  type CliContext,
  type ExitCode,
  type InitStep,
  type Writer,
} from './context.js';
export {
  WORKSPACE_DIRECTORIES,
  WORKSPACE_GITATTRIBUTES,
  WORKSPACE_GITIGNORE,
} from './commands/init.js';
export { PROFILE_GITIGNORE, defaultLanguage } from './commands/profile.js';
