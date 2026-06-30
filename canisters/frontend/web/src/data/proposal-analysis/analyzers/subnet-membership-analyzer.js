import { PROPOSAL_ISSUE_CODES } from '../issue-codes.js';
import { createIssue } from '../proposal-analysis-types.js';

function issue(base, overrides = {}) {
  return createIssue({ ...base, ...overrides });
}

function baseContext(context) {
  return {
    proposalId: context.intent.proposalId,
    actionKind: context.intent.actionKind,
    lifecycle: context.lifecycle,
  };
}

function nodeExists(context, nodeId) {
  return Boolean(context.analysisContext.nodesById[nodeId]);
}

function assignment(context, nodeId) {
  return context.analysisContext.findCurrentSubnetForNode(nodeId);
}

function addPreIssues(context, issues) {
  const base = baseContext(context);
  const targetSubnetId = context.intent.targetSubnetId;
  for (const nodeId of context.intent.addNodeIds) {
    if (!nodeExists(context, nodeId)) {
      issues.push(issue(base, {
        code: PROPOSAL_ISSUE_CODES.NODE_NOT_FOUND,
        severity: 'manual_review',
        title: 'Node was not found',
        message: 'The Registry node record could not be loaded for this node.',
        affected: { nodeIds: [nodeId] },
      }));
      continue;
    }
    const current = assignment(context, nodeId);
    if (current.status === 'ambiguous') {
      issues.push(issue(base, {
        code: PROPOSAL_ISSUE_CODES.NODE_MEMBERSHIP_AMBIGUOUS,
        severity: 'critical',
        title: 'Node membership is ambiguous',
        message: 'The node appears in more than one current subnet membership.',
        affected: { nodeIds: [nodeId], subnetIds: current.subnetIds },
      }));
    } else if (current.subnetId === targetSubnetId) {
      issues.push(issue(base, {
        code: PROPOSAL_ISSUE_CODES.ADD_NODE_ALREADY_IN_TARGET_SUBNET,
        title: 'Node is already in target subnet',
        message: 'This proposal adds a node that is already a member of the target subnet.',
        affected: { nodeIds: [nodeId], subnetIds: [targetSubnetId].filter(Boolean) },
      }));
    } else if (current.status === 'assigned') {
      issues.push(issue(base, {
        code: PROPOSAL_ISSUE_CODES.ADD_NODE_ALREADY_ASSIGNED,
        title: 'Node is already assigned',
        message: 'This proposal adds a node that is currently assigned to another subnet.',
        affected: { nodeIds: [nodeId], subnetIds: [current.subnetId] },
        evidence: [{ label: 'Current subnet', value: current.subnetId }],
      }));
    }
  }
}

function removePreIssues(context, issues) {
  const base = baseContext(context);
  const targetSubnetId = context.intent.targetSubnetId;
  for (const nodeId of context.intent.removeNodeIds) {
    const current = assignment(context, nodeId);
    if (current.status === 'unassigned') {
      issues.push(issue(base, {
        code: PROPOSAL_ISSUE_CODES.REMOVE_NODE_ALREADY_UNASSIGNED,
        title: 'Node is already unassigned',
        message: 'This proposal removes a node that is not currently assigned to a subnet.',
        affected: { nodeIds: [nodeId] },
      }));
    } else if (targetSubnetId && current.subnetId !== targetSubnetId) {
      issues.push(issue(base, {
        code: PROPOSAL_ISSUE_CODES.REMOVE_NODE_NOT_IN_TARGET_SUBNET,
        title: 'Node is not in target subnet',
        message: 'This proposal removes a node that is not currently in the target subnet.',
        affected: { nodeIds: [nodeId], subnetIds: [targetSubnetId, current.subnetId].filter(Boolean) },
      }));
    }
  }
}

function postIssues(context, issues) {
  const base = baseContext(context);
  const targetSubnetId = context.intent.targetSubnetId;
  for (const nodeId of context.intent.addNodeIds) {
    const current = assignment(context, nodeId);
    if (current.status === 'unassigned') {
      issues.push(issue(base, {
        code: PROPOSAL_ISSUE_CODES.EXECUTED_ADD_NODE_STILL_UNASSIGNED,
        title: 'Added node is still unassigned',
        message: 'This executed proposal added a node, but the node is not currently assigned to a subnet.',
        affected: { nodeIds: [nodeId] },
      }));
    } else if (targetSubnetId && current.subnetId !== targetSubnetId) {
      issues.push(issue(base, {
        code: PROPOSAL_ISSUE_CODES.EXECUTED_ADD_NODE_IN_WRONG_SUBNET,
        title: 'Added node is in a different subnet',
        message: 'This executed proposal added a node, but the node is currently assigned to a different subnet.',
        affected: { nodeIds: [nodeId], subnetIds: [targetSubnetId, current.subnetId].filter(Boolean) },
      }));
    }
  }
  for (const nodeId of context.intent.removeNodeIds) {
    const current = assignment(context, nodeId);
    if (targetSubnetId && current.subnetId === targetSubnetId) {
      issues.push(issue(base, {
        code: PROPOSAL_ISSUE_CODES.EXECUTED_REMOVE_NODE_STILL_IN_TARGET_SUBNET,
        title: 'Removed node is still in target subnet',
        message: 'This executed proposal removed a node, but the node is still in the target subnet.',
        affected: { nodeIds: [nodeId], subnetIds: [targetSubnetId] },
      }));
    }
  }
}

export const subnetMembershipAnalyzer = Object.freeze({
  id: 'subnet-membership',
  supports(intent) {
    return intent.actionKind === 'ChangeSubnetMembership';
  },
  analyze(context) {
    const issues = [];
    const base = baseContext(context);
    const addSet = new Set(context.intent.addNodeIds);
    const overlap = context.intent.removeNodeIds.filter((nodeId) => addSet.has(nodeId));
    for (const nodeId of overlap) {
      issues.push(issue(base, {
        code: PROPOSAL_ISSUE_CODES.NODE_ADDED_AND_REMOVED_IN_SAME_PROPOSAL,
        severity: 'critical',
        title: 'Node is added and removed',
        message: 'The same node appears in both add and remove lists.',
        affected: { nodeIds: [nodeId] },
      }));
    }
    if (context.lifecycle === 'pre_execution') {
      addPreIssues(context, issues);
      removePreIssues(context, issues);
    } else if (context.lifecycle === 'post_execution_success') {
      postIssues(context, issues);
    }
    return { issues, metrics: {}, dataWarnings: [] };
  },
});

export function analyzeSubnetMembershipLike(context) {
  return subnetMembershipAnalyzer.analyze(context);
}
