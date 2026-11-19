import {
  normalizeName,
  PlatformError,
  type Lock,
  type LockHandle,
} from '@mastery/platform';

/** 默认的等待时间。 */
const DEFAULT_TIMEOUT_MS = 30_000;

interface LockState {
  readonly waiters: (() => void)[];
}

/**
 * 内存里的锁空间：同一个锁空间的所有 {@link Lock} 互斥（模拟多个进程共享同一个 Workspace）。
 * 只在同一个 JavaScript 进程内有效；跨进程的锁由 Node 实现（锁文件）提供。
 */
export class MemoryLockSpace {
  readonly #locks = new Map<string, LockState>();

  /** 返回这个锁空间的一个入口。可以调用多次，模拟多个进程。 */
  lock(): Lock {
    return { acquire: (name, options) => this.#acquire(name, options) };
  }

  #acquire(
    name: string,
    options?: { readonly timeoutMs?: number },
  ): Promise<LockHandle> {
    return new Promise((resolve, reject) => {
      const lockName = normalizeName(name);
      const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const state = this.#locks.get(lockName);
      if (state === undefined) {
        this.#locks.set(lockName, { waiters: [] });
        resolve(this.#handle(lockName));
        return;
      }
      const grant = () => {
        clearTimeout(timer);
        resolve(this.#handle(lockName));
      };
      const timer = setTimeout(() => {
        const index = state.waiters.indexOf(grant);
        if (index !== -1) state.waiters.splice(index, 1);
        reject(
          new PlatformError('platform.lock_timeout', {
            name: lockName,
            timeoutMs,
          }),
        );
      }, timeoutMs);
      state.waiters.push(grant);
    });
  }

  #handle(name: string): LockHandle {
    let released = false;
    return {
      release: () => {
        if (!released) {
          released = true;
          this.#release(name);
        }
        return Promise.resolve();
      },
    };
  }

  /** 交给下一个等待者；没有等待者时释放。 */
  #release(name: string): void {
    const state = this.#locks.get(name);
    if (state === undefined) return;
    const next = state.waiters.shift();
    if (next === undefined) this.#locks.delete(name);
    else next();
  }
}
