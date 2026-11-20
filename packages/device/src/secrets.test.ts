import { describe, expect, it } from 'vitest';

import { MemorySecretStore, SecretStoreError } from './index.js';

const VALUE = 'sk-ant-api03-THIS-IS-THE-SECRET-VALUE-1234567890';

/** 把一个错误按各种常见方式转成文字：日志、序列化、模板字符串。 */
function everyRendering(error: unknown): string {
  const parts: string[] = [String(error), JSON.stringify(error)];
  if (error instanceof Error) {
    parts.push(
      error.message,
      error.stack ?? '',
      JSON.stringify(Object.entries(error)),
    );
    parts.push(JSON.stringify((error as { cause?: unknown }).cause ?? null));
  }
  return parts.join('\n');
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the operation to fail');
}

describe('MemorySecretStore', () => {
  it('stores, reads, overwrites and deletes entries', async () => {
    const store = new MemorySecretStore();
    expect(await store.get('provider-openai/api-key')).toBeNull();
    await store.set('provider-openai/api-key', VALUE);
    expect(await store.get('provider-openai/api-key')).toBe(VALUE);
    await store.set('provider-openai/api-key', 'other');
    expect(await store.get('provider-openai/api-key')).toBe('other');
    await store.delete('provider-openai/api-key');
    await store.delete('provider-openai/api-key');
    expect(await store.get('provider-openai/api-key')).toBeNull();
  });

  it.each(['', 'Provider/API-Key', 'a//b', '/a', 'a/', 'a b', 'a_b', VALUE])(
    'rejects the entry name %j',
    async (name) => {
      const error = await caught(new MemorySecretStore().set(name, 'x'));
      expect(error).toBeInstanceOf(SecretStoreError);
      expect((error as SecretStoreError).code).toBe('secret.invalid_name');
    },
  );

  it('rejects an empty value', async () => {
    const error = await caught(
      new MemorySecretStore().set('provider-openai/api-key', ''),
    );
    expect((error as SecretStoreError).code).toBe('secret.empty_value');
  });

  it('reports secret.unavailable while the keychain is not available', async () => {
    const store = new MemorySecretStore();
    store.setUnavailable(true);
    const error = await caught(store.get('provider-openai/api-key'));
    expect((error as SecretStoreError).code).toBe('secret.unavailable');
    store.setUnavailable(false);
    expect(await store.get('provider-openai/api-key')).toBeNull();
  });
});

describe('SecretStore errors never contain the value', () => {
  it.each([
    [
      'an invalid name (the value passed as the name by mistake)',
      (s: MemorySecretStore) => s.set(VALUE, VALUE),
    ],
    [
      'an invalid name with a value',
      (s: MemorySecretStore) => s.set('Bad Name', VALUE),
    ],
    [
      'an unavailable keychain',
      (s: MemorySecretStore) => {
        s.setUnavailable(true);
        return s.set('provider-openai/api-key', VALUE);
      },
    ],
  ] as const)('%s', async (_case, operation) => {
    const store = new MemorySecretStore();
    const error = await caught(operation(store));
    expect(error).toBeInstanceOf(SecretStoreError);
    const text = everyRendering(error);
    expect(text).not.toContain(VALUE);
    expect(text).not.toContain('THIS-IS-THE-SECRET');
  });

  it('serializes only the code, the entry name and the message', async () => {
    const error = await caught(
      (() => {
        const store = new MemorySecretStore();
        store.setUnavailable(true);
        return store.set('provider-openai/api-key', VALUE);
      })(),
    );
    const json = JSON.parse(JSON.stringify(error)) as Record<string, unknown>;
    expect(Object.keys(json).sort()).toEqual([
      'code',
      'message',
      'name',
      'secretName',
    ]);
    expect(json).toMatchObject({
      name: 'SecretStoreError',
      code: 'secret.unavailable',
      secretName: 'provider-openai/api-key',
    });
  });
});
