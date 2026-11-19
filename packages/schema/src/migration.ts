import { POSITIVE_INTEGER_MIN } from './constraints.js';
import {
  makeIssue,
  type SchemaErrorCode,
  type SchemaErrorParams,
  type SchemaIssue,
} from './errors.js';
import { isPlainObject } from './fields.js';

/**
 * 一步迁移：把版本 N 的数据升级到版本 N+1。
 *
 * 必须是纯函数：返回新对象，不能修改输入，没有 I/O，结果是确定的。
 * 输入是普通对象（不保留旧版本的 schema），升级后的结果按当前 schema 校验。
 * `schema_version` 由框架在每一步之后设置，步骤函数不用写。
 */
export type MigrationStep = (
  data: Readonly<Record<string, unknown>>,
) => Record<string, unknown>;

/** 一种文件的迁移表。 */
export interface MigrationTable {
  /** 当前版本。 */
  readonly currentVersion: number;
  /** `steps[N]` 把版本 N 升级到 N+1。 */
  readonly steps: Readonly<Partial<Record<number, MigrationStep>>>;
}

/** 迁移结果：成功时带升级后的数据（还没有按当前 schema 校验）和起止版本。 */
export type MigrationResult =
  | {
      readonly success: true;
      readonly data: Record<string, unknown>;
      /** 文件原来的版本。 */
      readonly from: number;
      /** 升级后的版本（当前版本）。`from < to` 说明这是旧格式的文件。 */
      readonly to: number;
    }
  | { readonly success: false; readonly issues: SchemaIssue[] };

function fail<C extends SchemaErrorCode>(
  code: C,
  path: readonly (string | number)[],
  params: SchemaErrorParams[C],
): MigrationResult {
  return { success: false, issues: [makeIssue(code, path, params)] };
}

/**
 * 用一组迁移表创建 `migrate(kind, data)`：从任意旧版本逐级升级到当前版本。
 *
 * - 版本比当前的还新：`migration.version_too_new`。这样的文件是新版本的 Mastery OS 写的，
 *   调用方只能读，**不能修改或覆盖**。
 * - 缺少某一步迁移：`migration.no_path`，一步都不执行。
 * - 某一步抛出异常或没有返回对象：`migration.step_failed`。
 * - 不改写磁盘文件；只有用户执行 `mastery migrate` 时才写回（ADR-0005）。
 *
 * @param tables - 每种文件的迁移表
 */
export function createMigrator<K extends string>(
  tables: Readonly<Record<K, MigrationTable>>,
): (kind: K, data: unknown) => MigrationResult {
  return (kind, data) => {
    const { currentVersion: latest, steps } = tables[kind];
    if (!isPlainObject(data)) return fail('migration.missing_version', [], {});
    const version = data.schema_version;
    if (version === undefined) {
      return fail('migration.missing_version', ['schema_version'], {});
    }
    if (
      typeof version !== 'number' ||
      !Number.isInteger(version) ||
      version < POSITIVE_INTEGER_MIN
    ) {
      return fail('migration.invalid_version', ['schema_version'], {
        value: version,
      });
    }
    if (version > latest) {
      return fail('migration.version_too_new', ['schema_version'], {
        version,
        latest,
      });
    }
    // 先确认整条路径都在，再开始执行，避免只升级了一半。
    for (let from = version; from < latest; from++) {
      if (steps[from] === undefined) {
        return fail('migration.no_path', ['schema_version'], {
          version,
          missing_step: from,
          latest,
        });
      }
    }

    let current: Record<string, unknown> = data;
    for (let from = version; from < latest; from++) {
      const step = steps[from] as MigrationStep;
      let next: unknown;
      try {
        next = step(current);
      } catch (error) {
        return fail('migration.step_failed', [], {
          from,
          to: from + 1,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      if (!isPlainObject(next)) {
        return fail('migration.step_failed', [], {
          from,
          to: from + 1,
          detail: 'the step did not return an object',
        });
      }
      current = { ...next, schema_version: from + 1 };
    }
    return { success: true, data: current, from: version, to: latest };
  };
}
