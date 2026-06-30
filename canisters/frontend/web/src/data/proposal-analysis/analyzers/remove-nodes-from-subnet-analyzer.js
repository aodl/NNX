import { analyzeSubnetMembershipLike } from './subnet-membership-analyzer.js';

export const removeNodesFromSubnetAnalyzer = Object.freeze({
  id: 'remove-nodes-from-subnet',
  supports(intent) {
    return intent.actionKind === 'RemoveNodesFromSubnet';
  },
  analyze(context) {
    let targetSubnetId = context.intent.targetSubnetId;
    if (!targetSubnetId && context.intent.removeNodeIds.length > 0) {
      const subnetIds = new Set();
      for (const nodeId of context.intent.removeNodeIds) {
        const current = context.analysisContext.findCurrentSubnetForNode(nodeId);
        if (current.subnetId) subnetIds.add(current.subnetId);
      }
      if (subnetIds.size === 1) targetSubnetId = [...subnetIds][0];
    }
    return analyzeSubnetMembershipLike({
      ...context,
      intent: {
        ...context.intent,
        actionKind: 'ChangeSubnetMembership',
        targetSubnetId,
        addNodeIds: [],
      },
    });
  },
});
