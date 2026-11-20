/**
 * 钥匙串条目的名字：一个或多个用 `/` 分开的 slug，比如 `provider-openai/api-key`。
 * 名字会出现在 device.yaml、日志和错误里，所以名字本身不能是密钥。
 */
export const SECRET_NAME_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

/** {@link SecretStore} 的错误码。 */
export type SecretStoreErrorCode =
  /** 条目名不合法。 */
  | 'secret.invalid_name'
  /** 值为空。 */
  | 'secret.empty_value'
  /** 钥匙串暂时用不了（被锁住、用户拒绝访问等）。 */
  | 'secret.unavailable';

/**
 * SecretStore 的错误。**任何情况下都不包含密钥的值**：消息、参数、`cause`、`toString()`、
 * JSON 序列化里都只有条目名。
 */
export class SecretStoreError extends Error {
  override readonly name = 'SecretStoreError';

  constructor(
    readonly code: SecretStoreErrorCode,
    readonly secretName: string,
    detail: string,
  ) {
    super(`${detail} (keychain entry "${secretName}")`);
  }

  /** 序列化时只给出错误码和条目名。 */
  toJSON(): {
    name: string;
    code: SecretStoreErrorCode;
    secretName: string;
    message: string;
  } {
    return {
      name: this.name,
      code: this.code,
      secretName: this.secretName,
      message: this.message,
    };
  }
}

function checkName(name: string): void {
  if (!SECRET_NAME_PATTERN.test(name)) {
    // 不合法的名字可能是误把密钥当成了名字，所以错误里不写出名字。
    throw new SecretStoreError(
      'secret.invalid_name',
      '(invalid name)',
      'keychain entry names are slugs separated by "/", for example provider-openai/api-key',
    );
  }
}

/**
 * 系统钥匙串的端口（Keychain、Windows Credential Manager、Secret Service、Android Keystore）。
 * 密钥只放在这里，不写进任何文件（不变量 13）。真实的实现在 M6（Tauri）和 CLI 里。
 */
export interface SecretStore {
  /** 读取一个条目；不存在时返回 null。 */
  get(name: string): Promise<string | null>;
  /** 写入一个条目（已有的覆盖）。值不能为空。 */
  set(name: string, value: string): Promise<void>;
  /** 删除一个条目；不存在时什么都不做。 */
  delete(name: string): Promise<void>;
}

/** 内存里的 {@link SecretStore}，测试用。 */
export class MemorySecretStore implements SecretStore {
  readonly #entries = new Map<string, string>();
  #unavailable = false;

  /** 模拟钥匙串用不了（比如被锁住）：之后的操作都报 `secret.unavailable`，直到再次调用传入 false。 */
  setUnavailable(unavailable: boolean): void {
    this.#unavailable = unavailable;
  }

  get(name: string): Promise<string | null> {
    return this.#run(name, () => this.#entries.get(name) ?? null);
  }

  set(name: string, value: string): Promise<void> {
    return this.#run(name, () => {
      if (value === '') {
        throw new SecretStoreError(
          'secret.empty_value',
          name,
          'a keychain entry cannot be empty',
        );
      }
      this.#entries.set(name, value);
    });
  }

  delete(name: string): Promise<void> {
    return this.#run(name, () => {
      this.#entries.delete(name);
    });
  }

  #run<T>(name: string, operation: () => T): Promise<T> {
    return new Promise((resolve) => {
      checkName(name);
      if (this.#unavailable) {
        throw new SecretStoreError(
          'secret.unavailable',
          name,
          'the keychain is not available',
        );
      }
      resolve(operation());
    });
  }
}
