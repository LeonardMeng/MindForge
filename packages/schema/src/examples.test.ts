// docs/protocol/examples/ 里的 JSON 示例必须能通过校验，说明页里引用的就是这些文件。
// YAML 示例由 store 包的 docs-examples.test.ts 校验（schema 只依赖 zod，没有 YAML 解析器）。
import { describe, expect, it } from 'vitest';

import assessmentSession from '../../../docs/protocol/examples/assessment-session.json' with { type: 'json' };
import evidence from '../../../docs/protocol/examples/evidence.json' with { type: 'json' };
import manualEvidence from '../../../docs/protocol/examples/evidence-manual.json' with { type: 'json' };
import masteryHistoryEntry from '../../../docs/protocol/examples/mastery-history-entry.json' with { type: 'json' };
import proposal from '../../../docs/protocol/examples/proposal.json' with { type: 'json' };
import {
  AssessmentSession,
  Evidence,
  MasteryHistoryEntry,
  Proposal,
  validate,
} from './index.js';

describe('docs/protocol/examples', () => {
  it.each([
    ['assessment-session.json', AssessmentSession, assessmentSession],
    ['evidence.json', Evidence, evidence],
    ['evidence-manual.json', Evidence, manualEvidence],
    ['mastery-history-entry.json', MasteryHistoryEntry, masteryHistoryEntry],
    ['proposal.json', Proposal, proposal],
  ] as const)('%s is valid', (_file, schema, example) => {
    const result = validate(schema, example);
    expect(result.success ? [] : result.issues).toEqual([]);
  });
});
