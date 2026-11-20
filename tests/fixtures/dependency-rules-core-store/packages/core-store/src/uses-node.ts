// core-store 不能用 node:*。
import { readFileSync } from 'node:fs';

export const d = readFileSync;
