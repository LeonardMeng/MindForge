/**
 * 密钥检查：**只是一道保险，不是安全边界。** 真正的规则是密钥只放在系统钥匙串里
 * （README 第 7 节、不变量 13）。这里只拦住最常见的失误：把 API key、token、密码
 * 写进会被提交或同步的文件。换个名字或换种写法当然能绕过去，所以不能依赖它保证安全。
 *
 * 用在 `device.yaml`、`defaults.yaml`、`workspaces.yaml` 和 `workspace.yaml`（插件配置）。
 * Concept 的 frontmatter 不检查：那里是 Obsidian 的自由字段，误报会很烦人。
 */
import { z } from 'zod';

import { pushIssue } from './errors.js';
import { isPlainObject } from './fields.js';

/** 单独出现就算密钥的词（拆词后整词比较，所以 `max_tokens` 不算）。 */
const SECRET_WORDS: ReadonlySet<string> = new Set([
  'token',
  'secret',
  'secrets',
  'password',
  'passwords',
  'passwd',
  'apikey',
  'credential',
  'credentials',
]);

/** 相邻出现就算密钥的两个词，比如 `api_key`、`privateKey`。 */
const SECRET_PAIRS: readonly (readonly [string, string])[] = [
  ['api', 'key'],
  ['private', 'key'],
];

/** 常见的 token 格式。前面不能紧挨着字母或数字，避免把普通单词的一部分当成 token。 */
const SECRET_VALUES: readonly (readonly [kind: string, pattern: RegExp])[] = [
  ['GitHub token', /(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{20,}/],
  ['GitHub token', /(?<![A-Za-z0-9])github_pat_[A-Za-z0-9_]{20,}/],
  // OpenAI（sk-、sk-proj-）和 Anthropic（sk-ant-）的 API key。
  ['API key', /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/],
  ['AWS access key ID', /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![0-9A-Z])/],
  ['private key', /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/],
];

/** 把键名拆成小写的词：按 `_`、`-`、`.`、空格和驼峰拆开（`APIKey` → `api`、`key`）。 */
function wordsOf(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word !== '')
    .map((word) => word.toLowerCase());
}

/**
 * 键名看起来是不是密钥。
 *
 * @param key - 对象的键
 */
export function isSecretKey(key: string): boolean {
  const words = wordsOf(key);
  if (words.some((word) => SECRET_WORDS.has(word))) return true;
  return words.some((word, index) =>
    SECRET_PAIRS.some(
      ([first, second]) => word === first && words[index + 1] === second,
    ),
  );
}

/**
 * 字符串里有没有常见格式的 token，有的话返回它的种类（比如 `GitHub token`），否则返回 null。
 *
 * @param value - 要检查的字符串
 */
export function secretKind(value: string): string | null {
  for (const [kind, pattern] of SECRET_VALUES) {
    if (pattern.test(value)) return kind;
  }
  return null;
}

/** 找到的一处疑似密钥。参数里**不包含值本身**，避免错误信息把密钥再泄露一次。 */
export interface SecretFinding {
  readonly path: readonly (string | number)[];
  readonly code: 'secret.field_not_allowed' | 'secret.value_not_allowed';
  readonly params: { readonly key: string } | { readonly kind: string };
}

/**
 * 在任意深度找出疑似密钥的键和值。键看起来是密钥时，不再检查它下面的值。
 *
 * @param value - 解析后的文件内容
 */
export function findSecrets(value: unknown): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const walk = (node: unknown, path: (string | number)[]): void => {
    if (typeof node === 'string') {
      const kind = secretKind(node);
      if (kind !== null) {
        findings.push({
          path,
          code: 'secret.value_not_allowed',
          params: { kind },
        });
      }
    } else if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, [...path, index]));
    } else if (isPlainObject(node)) {
      for (const [key, child] of Object.entries(node)) {
        if (isSecretKey(key)) {
          findings.push({
            path: [...path, key],
            code: 'secret.field_not_allowed',
            params: { key },
          });
        } else {
          walk(child, [...path, key]);
        }
      }
    }
  };
  walk(value, []);
  return findings;
}

/**
 * 在 `schema` 之前先检查有没有密钥。找到时只报密钥（`secret.*`），不再报其他错误，
 * 比如严格对象里的 `api_key` 报 `secret.field_not_allowed`，而不是 `field.unknown`。
 * 导出的 JSON Schema 和 `schema` 相同。
 *
 * @param schema - 文件的 schema
 */
export function noSecrets<S extends z.ZodType>(schema: S) {
  return z
    .unknown()
    .check((ctx) => {
      for (const finding of findSecrets(ctx.value)) {
        if (
          finding.code === 'secret.field_not_allowed' &&
          'key' in finding.params
        ) {
          pushIssue(ctx, finding.code, finding.params, finding.path);
        } else if ('kind' in finding.params) {
          pushIssue(
            ctx,
            'secret.value_not_allowed',
            finding.params,
            finding.path,
          );
        }
      }
    })
    .pipe(schema);
}
