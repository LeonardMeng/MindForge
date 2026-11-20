import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { findSecrets, isSecretKey, noSecrets, secretKind } from './secrets.js';
import { issuesOf } from './test-helpers.js';

describe('isSecretKey: whole words, after splitting at _ - . and camelCase', () => {
  it.each([
    'api_key',
    'apiKey',
    'APIKey',
    'x-api-key',
    'apikey',
    'token',
    'access_token',
    'githubToken',
    'password',
    'db_passwd',
    'secret',
    'client_secret',
    'secrets',
    'credential',
    'credentials',
    'private_key',
    'privateKey',
    'SSH_PRIVATE_KEY',
  ])('rejects %j', (key) => {
    expect(isSecretKey(key)).toBe(true);
  });

  it.each([
    'max_tokens',
    'tokenizer',
    'key',
    'keys',
    'primary_key',
    'api',
    'api_url',
    'secretary',
    'passage',
    'style',
    'model',
    'local_endpoint',
    'keychain_entry',
  ])('allows %j', (key) => {
    expect(isSecretKey(key)).toBe(false);
  });
});

describe('secretKind: well-known token formats anywhere in a string', () => {
  const body = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';
  it.each([
    [`ghp_${body}`, 'GitHub token'],
    [`gho_${body}`, 'GitHub token'],
    [`ghu_${body}`, 'GitHub token'],
    [`ghs_${body}`, 'GitHub token'],
    [`ghr_${body}`, 'GitHub token'],
    [`github_pat_11ABCDEFG0_${body}`, 'GitHub token'],
    [`sk-${body}`, 'API key'],
    [`sk-ant-api03-${body}`, 'API key'],
    [`sk-proj-${body}`, 'API key'],
    ['AKIAIOSFODNN7EXAMPLE', 'AWS access key ID'],
    ['-----BEGIN PRIVATE KEY-----', 'private key'],
    ['-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n', 'private key'],
    ['-----BEGIN RSA PRIVATE KEY-----', 'private key'],
    [`https://ghp_${body}@github.com/me/repo.git`, 'GitHub token'],
    [`export OPENAI_API_KEY=sk-${body}`, 'API key'],
  ])('recognizes %j', (value, kind) => {
    expect(secretKind(value)).toBe(kind);
  });

  it.each([
    'ghp_',
    'ghp_short',
    'sk-learn',
    'task-assessment-for-self-attention-v2',
    'risk-0123456789abcdefghij',
    'AKIA1234',
    'AKIAIOSFODNN7EXAMPLE2',
    '-----BEGIN PUBLIC KEY-----',
    'ollama:qwen3-14b',
    'git@github.com:me/mastery-ai.git',
    '解释为什么要除以 √d',
  ])('allows %j', (value) => {
    expect(secretKind(value)).toBeNull();
  });
});

describe('findSecrets', () => {
  it('finds secret keys and values at any depth, with their paths, without repeating the value', () => {
    const findings = findSecrets({
      plugins: {
        'agent-x': {
          api_key: 'whatever',
          nested: [{ note: 'AKIAIOSFODNN7EXAMPLE' }],
        },
      },
      max_tokens: 100,
    });
    expect(findings.map((f) => [f.path.join('.'), f.code])).toEqual([
      ['plugins.agent-x.api_key', 'secret.field_not_allowed'],
      ['plugins.agent-x.nested.0.note', 'secret.value_not_allowed'],
    ]);
    expect(JSON.stringify(findings)).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('checks the value of a secret-looking key only once, as a key', () => {
    const findings = findSecrets({
      token: 'ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8',
    });
    expect(findings.map((f) => f.code)).toEqual(['secret.field_not_allowed']);
  });
});

describe('noSecrets', () => {
  const Inner = z.strictObject({ a: z.string() });
  const Guarded = noSecrets(Inner);

  it('reports only the secrets when there are any (instead of field.unknown)', () => {
    expect(issuesOf(Guarded, { a: 1, api_key: 'x' })).toEqual([
      ['api_key', 'secret.field_not_allowed'],
    ]);
  });

  it('validates normally when there are no secrets', () => {
    expect(issuesOf(Guarded, { a: 1 })).toEqual([['a', 'field.invalid_type']]);
    expect(issuesOf(Guarded, { a: 'x' })).toEqual([]);
  });

  it('exports the same JSON Schema as the guarded schema', () => {
    expect(z.toJSONSchema(Guarded, { io: 'output' })).toEqual(
      z.toJSONSchema(Inner, { io: 'output' }),
    );
  });
});
