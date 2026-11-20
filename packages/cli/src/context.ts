/** 写出文字的地方（标准输出、标准错误，测试里换成内存缓冲）。 */
export interface Writer {
  write(text: string): void;
}

/** `init` 的步骤，测试用钩子在这些步骤之后模拟崩溃。 */
export type InitStep = 'files' | 'registered';

/**
 * 运行一条命令需要的环境。`main.ts` 从真实的进程环境构造它；测试传入临时目录，
 * 不碰真实的 home 目录，也不启动子进程。
 */
export interface CliContext {
  /** 用户主目录的绝对路径，用来展开 `~`。 */
  readonly home: string;
  /** 设备目录的绝对路径（默认 `~/.mastery`，可以用环境变量 `MASTERY_HOME` 改）。 */
  readonly deviceDir: string;
  /** 当前目录：相对路径相对于它。 */
  readonly cwd: string;
  readonly stdout: Writer;
  readonly stderr: Writer;
  /** 这台设备的名称（默认用主机名）。 */
  readonly hostname: string;
  /** 用户名（`profile init` 的默认显示名称）。 */
  readonly username: string;
  /** 系统的语言区域，比如 `zh-CN`（`profile init` 的默认语言）。 */
  readonly locale: string;
  /** `process.platform`。 */
  readonly platform: string;
  /** 只给测试用的钩子。 */
  readonly hooks?: {
    /** `init` 完成一个步骤之后调用；抛出错误可以模拟崩溃。 */
    readonly afterInitStep?: (step: InitStep) => void;
  };
}

/** 退出码：0 成功（可以有警告），1 校验或领域错误，2 用法错误。 */
export const EXIT = { ok: 0, failed: 1, usage: 2 } as const;
/** 退出码。 */
export type ExitCode = (typeof EXIT)[keyof typeof EXIT];
