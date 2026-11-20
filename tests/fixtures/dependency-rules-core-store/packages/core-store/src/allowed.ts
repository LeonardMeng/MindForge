// core-store 可以用 core、store、platform 的值：这是允许的。
import { core } from '../../core/src/index.js';
import { platform } from '../../platform/src/index.js';
import { store } from '../../store/src/index.js';

export const allowed = [core, store, platform];
