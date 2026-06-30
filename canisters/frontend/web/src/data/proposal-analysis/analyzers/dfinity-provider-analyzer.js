import { DFINITY_NODE_PROVIDER_ID } from '../analysis-policy.js';
import { PROPOSAL_ISSUE_CODES } from '../issue-codes.js';
import { createIssue } from '../proposal-analysis-types.js';

function dfinityNodeIds(nodeIds, nodesById) {
  return nodeIds.filter((nodeId) => nodesById[nodeId]?.nodeProviderId === DFINITY_NODE_PROVIDER_ID);
}

export const dfinityProviderAnalyzer = Object.freeze({
  id: 'dfinity-provider',
  supports(intent) {
    return ['ChangeSubnetMembership', 'CreateSubnet', 'RemoveNodesFromSubnet'].includes(intent.actionKind);
  },
  analyze(context) {
    const before = dfinityNodeIds(context.stateChange.beforeNodeIds, context.analysisContext.nodesById);
    const after = dfinityNodeIds(context.stateChange.afterNodeIds, context.analysisContext.nodesById);
    const metric = {
      beforeCount: before.length,
      afterCount: after.length,
      delta: after.length - before.length,
      dfinityNodeIdsBefore: before,
      dfinityNodeIdsAfter: after,
    };
    const issues = [];
    if (before.length >= 1 && after.length === 0) {
      issues.push(createIssue({
        code: PROPOSAL_ISSUE_CODES.DFINITY_PROVIDER_REMOVED_FROM_SUBNET,
        severity: 'warning',
        lifecycle: context.lifecycle,
        title: 'DFINITY provider would be removed',
        message: 'The subnet would have no nodes from the DFINITY node provider after this proposal.',
        proposalId: context.intent.proposalId,
        actionKind: context.intent.actionKind,
        affected: { nodeIds: before, nodeProviderIds: [DFINITY_NODE_PROVIDER_ID] },
        evidence: [
          { label: 'Before', value: before.length.toString() },
          { label: 'After', value: after.length.toString() },
        ],
      }));
    }
    return { issues, metrics: { dfinityProvider: metric }, dataWarnings: [] };
  },
});
