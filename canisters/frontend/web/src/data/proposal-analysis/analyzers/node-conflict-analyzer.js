import { parseProposalIntent } from '../proposal-action-parser.js';
import { PROPOSAL_ISSUE_CODES } from '../issue-codes.js';
import { proposalLifecycle, createIssue } from '../proposal-analysis-types.js';

function nodeIntent(intent, nodeId) {
  const adds = intent.addNodeIds.includes(nodeId);
  const removes = intent.removeNodeIds.includes(nodeId);
  if (adds && removes) return 'add_remove';
  if (adds) return 'add';
  if (removes) return 'remove';
  return 'reference';
}

export const nodeConflictAnalyzer = Object.freeze({
  id: 'node-conflict',
  supports(intent) {
    return intent.allNodeIds.length > 0;
  },
  analyze(context) {
    if (context.lifecycle !== 'pre_execution') return { issues: [], metrics: {}, dataWarnings: [] };
    const openIntents = context.openIntents ?? (context.analysisContext.openProposals ?? [])
      .filter((proposal) => proposalLifecycle(proposal) === 'pre_execution')
      .map((proposal) => parseProposalIntent(proposal))
      .filter((intent) => intent.actionKind !== 'Unsupported');
    const issues = [];

    for (const nodeId of context.intent.allNodeIds) {
      const references = openIntents.filter((intent) => intent.allNodeIds.includes(nodeId));
      const uniqueProposalIds = [...new Set(references.map((intent) => intent.proposalId?.toString()).filter(Boolean))];
      if (uniqueProposalIds.length <= 1) continue;
      const intents = new Set(references.map((intent) => nodeIntent(intent, nodeId)));
      const conflict = intents.has('add') && intents.has('remove');
      issues.push(createIssue({
        code: PROPOSAL_ISSUE_CODES.NODE_REFERENCED_BY_MULTIPLE_OPEN_PROPOSALS,
        severity: conflict ? 'critical' : 'warning',
        lifecycle: context.lifecycle,
        title: 'Node appears in multiple open proposals',
        message: conflict
          ? 'This node is referenced by multiple open proposals with conflicting add/remove intents.'
          : 'This node is referenced by more than one currently open proposal.',
        proposalId: context.intent.proposalId,
        actionKind: context.intent.actionKind,
        affected: {
          proposalIds: uniqueProposalIds.map((id) => BigInt(id)),
          nodeIds: [nodeId],
        },
        evidence: uniqueProposalIds.map((id) => ({ label: 'Open proposal', value: id })),
      }));
    }
    return { issues, metrics: {}, dataWarnings: [] };
  },
});
