import { PROPOSAL_ISSUE_CODES } from '../issue-codes.js';
import { createIssue } from '../proposal-analysis-types.js';

export const unsupportedActionAnalyzer = Object.freeze({
  id: 'unsupported-action',
  supports(intent) {
    return intent.actionKind === 'Unsupported';
  },
  analyze(context) {
    return {
      issues: [createIssue({
        code: PROPOSAL_ISSUE_CODES.UNSUPPORTED_PROPOSAL_ANALYSIS,
        severity: 'info',
        lifecycle: context.lifecycle,
        title: 'Proposal action is not analysed',
        message: 'NNX does not yet analyse this proposal action type.',
        proposalId: context.intent.proposalId,
        actionKind: context.intent.actionKind,
        confidence: 'low',
      })],
      metrics: {},
      dataWarnings: [],
    };
  },
});
