// profile 只能依赖 schema：import git 必须被拒绝。
import { git } from '../../git/src/index.js';

export const b = git;
