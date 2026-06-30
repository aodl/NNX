import { PROPOSAL_ISSUE_CODES } from '../issue-codes.js';
import { createIssue } from '../proposal-analysis-types.js';

export const createSubnetAnalyzer = Object.freeze({
  id: 'create-subnet',
  supports(intent) {
    return intent.actionKind === 'CreateSubnet';
  },
  analyze(context) {
    const issues = [];
    const base = {
      proposalId: context.intent.proposalId,
      actionKind: context.intent.actionKind,
      lifecycle: context.lifecycle,
    };
    if (context.lifecycle === 'pre_execution') {
      for (const nodeId of context.intent.addNodeIds) {
        if (!context.analysisContext.nodesById[nodeId]) {
          issues.push(createIssue({
            ...base,
            code: PROPOSAL_ISSUE_CODES.NODE_NOT_FOUND,
            severity: 'manual_review',
            title: 'Node was not found',
            message: 'The Registry node record could not be loaded for this create-subnet node.',
            affected: { nodeIds: [nodeId] },
          }));
          continue;
        }
        const current = context.analysisContext.findCurrentSubnetForNode(nodeId);
        if (current.status === 'assigned') {
          issues.push(createIssue({
            ...base,
            code: PROPOSAL_ISSUE_CODES.CREATE_SUBNET_NODE_ALREADY_ASSIGNED,
            title: 'Create-subnet node is already assigned',
            message: 'This proposal creates a subnet with a node that is currently assigned to an existing subnet.',
            affected: { nodeIds: [nodeId], subnetIds: [current.subnetId] },
          }));
        }
      }
    } else if (context.lifecycle === 'post_execution_success' && !context.intent.targetSubnetId) {
      issues.push(createIssue({
        ...base,
        code: PROPOSAL_ISSUE_CODES.UNSUPPORTED_PROPOSAL_ANALYSIS,
        severity: 'manual_review',
        title: 'Created subnet cannot be linked',
        message: 'NNX cannot link this executed create-subnet proposal to a concrete current subnet from available normalized data.',
        confidence: 'medium',
      }));
    }
    return { issues, metrics: {}, dataWarnings: [] };
  },
});
