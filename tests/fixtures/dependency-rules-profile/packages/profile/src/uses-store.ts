// profile 只能依赖 schema：import store 必须被拒绝。
import { store } from '../../store/src/index.js';

export const a = store;
