import type { ExplanationItem } from '@mastery/schema';

type Params = Readonly<Record<string, unknown>>;
const text = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

/** 规则 v1 的 explanation 消息表（ADR-0013：code 稳定，文字只从这里生成）。 */
const MESSAGES_EN = {
  'state.not_assessed': () => 'not assessed yet: there is no evidence',
  'state.diagnosed': () =>
    'diagnosed: the first evidence shows where you stand',
  'state.learning': () =>
    'learning: the conditions for provisional mastery are not met yet',
  'state.provisional_mastery': () =>
    'provisional mastery: every assessed dimension meets its threshold',
  'state.mastered': () =>
    'mastered: confirmed by spaced independent verifications covering every assessed dimension',
  'state.needs_review': () =>
    'needs review: it was mastered, but later evidence did not hold up; it must be verified again',
  'met.independent_verifications': (p: Params) =>
    `${text(p.count)} passing independent verification(s) at the current criteria version`,
  'missing.untested': (p: Params) =>
    `${text(p.dimension)} has not been assessed`,
  'missing.below_threshold': (p: Params) =>
    `${text(p.dimension)} is ${text(p.score)}, below the threshold ${text(p.threshold)}`,
  'missing.independent_verifications': (p: Params) =>
    `${text(p.have)} of ${text(p.need)} passing independent verification(s)`,
  'missing.spacing': (p: Params) =>
    `the passing independent verifications span ${text(p.days)} day(s); at least ${text(p.need)} are needed`,
  'missing.verification_coverage': (p: Params) =>
    `${text(p.dimension)} has not been scored by a passing independent verification`,
  'missing.reverification': () =>
    'every condition is met again; a new passing independent verification confirms mastery',
} as const satisfies Record<string, (p: Params) => string>;

/** 规则 v1 的 explanation code。 */
export type ExplanationCode = keyof typeof MESSAGES_EN;

/** 规则 v1 用到的所有 explanation code。 */
export const EXPLANATION_CODES = Object.keys(MESSAGES_EN) as ExplanationCode[];

/**
 * 把一项 explanation 转成英文。不认识的 code（比如别的规则版本的）原样返回 code。
 *
 * @param explanation - 一项 explanation
 */
export function formatExplanation(explanation: ExplanationItem): string {
  const format = (
    MESSAGES_EN as Record<string, ((p: Params) => string) | undefined>
  )[explanation.code];
  return format === undefined ? explanation.code : format(explanation.params);
}
