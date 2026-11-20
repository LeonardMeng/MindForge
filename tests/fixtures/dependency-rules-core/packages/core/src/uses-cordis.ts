// core 不能 import cordis。
// @ts-expect-error -- cordis 不是本仓库的依赖，样例只用来检查规则。
import { Context } from 'cordis';

export const d: unknown = Context;
