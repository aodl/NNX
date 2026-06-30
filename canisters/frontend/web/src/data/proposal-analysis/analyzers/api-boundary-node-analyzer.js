import { PROPOSAL_ISSUE_CODES } from '../issue-codes.js';
import { createIssue } from '../proposal-analysis-types.js';

function base(context) {
  return {
    proposalId: context.intent.proposalId,
    actionKind: context.intent.actionKind,
    lifecycle: context.lifecycle,
  };
}

function node(context, nodeId) {
  return context.analysisContext.nodesById[nodeId] ?? null;
}

function isBoundary(context, nodeId) {
  return (context.analysisContext.apiBoundaryNodeIds ?? []).includes(nodeId);
}

function membershipUnavailableIssue(context, nodeId) {
  return createIssue({
    ...base(context),
    code: PROPOSAL_ISSUE_CODES.API_BOUNDARY_MEMBERSHIP_UNAVAILABLE,
    severity: 'manual_review',
    title: 'API boundary membership unavailable',
    message: 'NNX cannot verify current API boundary membership from certified subnet state for this node.',
    affected: { nodeIds: [nodeId] },
    confidence: 'medium',
  });
}

export const apiBoundaryNodeAnalyzer = Object.freeze({
  id: 'api-boundary-node',
  supports(intent) {
    return intent.actionKind === 'AddApiBoundaryNodes' || intent.actionKind === 'RemoveApiBoundaryNodes';
  },
  analyze(context) {
    const issues = [];
    const common = base(context);
    const boundaryIdsKnown = Boolean(context.analysisContext.apiBoundaryMembershipAvailable);

    if (context.lifecycle === 'pre_execution' && context.intent.actionKind === 'AddApiBoundaryNodes') {
      for (const nodeId of context.intent.addNodeIds) {
        const detail = node(context, nodeId);
        if (!detail) {
          issues.push(createIssue({
            ...common,
            code: PROPOSAL_ISSUE_CODES.NODE_NOT_FOUND,
            severity: 'manual_review',
            title: 'Node was not found',
            message: 'The Registry node record could not be loaded for this API boundary node.',
            affected: { nodeIds: [nodeId] },
          }));
          continue;
        }
        if (!boundaryIdsKnown) {
          issues.push(membershipUnavailableIssue(context, nodeId));
        } else if (isBoundary(context, nodeId)) {
          issues.push(createIssue({
            ...common,
            code: PROPOSAL_ISSUE_CODES.API_BOUNDARY_ADD_NODE_ALREADY_API_BOUNDARY,
            title: 'Node is already API boundary',
            message: 'Certified subnet state already lists this node as an API boundary node.',
            affected: { nodeIds: [nodeId] },
          }));
        }
        const current = context.analysisContext.findCurrentSubnetForNode(nodeId);
        if (current.status === 'assigned') {
          issues.push(createIssue({
            ...common,
            code: PROPOSAL_ISSUE_CODES.API_BOUNDARY_ADD_NODE_ALREADY_ASSIGNED,
            title: 'API boundary node is assigned',
            message: 'This proposal adds an API boundary node that is currently assigned to a subnet.',
            affected: { nodeIds: [nodeId], subnetIds: [current.subnetId] },
          }));
        }
        if (!detail.domain) {
          issues.push(createIssue({
            ...common,
            code: PROPOSAL_ISSUE_CODES.API_BOUNDARY_ADD_NODE_MISSING_DOMAIN,
            title: 'API boundary node is missing domain',
            message: 'The Registry node record does not include a domain for this node.',
            affected: { nodeIds: [nodeId] },
          }));
        }
        if (!detail.publicIpv4?.ipAddr) {
          issues.push(createIssue({
            ...common,
            code: PROPOSAL_ISSUE_CODES.API_BOUNDARY_ADD_NODE_MISSING_IPV4,
            title: 'API boundary node is missing IPv4',
            message: 'The Registry node record does not include public IPv4 configuration for this node.',
            affected: { nodeIds: [nodeId] },
          }));
        }
      }
    } else if (context.lifecycle === 'pre_execution' && context.intent.actionKind === 'RemoveApiBoundaryNodes') {
      for (const nodeId of context.intent.removeNodeIds) {
        if (!node(context, nodeId)) {
          issues.push(createIssue({
            ...common,
            code: PROPOSAL_ISSUE_CODES.NODE_NOT_FOUND,
            severity: 'manual_review',
            title: 'Node was not found',
            message: 'The Registry node record could not be loaded for this API boundary node.',
            affected: { nodeIds: [nodeId] },
          }));
          continue;
        }
        if (!boundaryIdsKnown) {
          issues.push(membershipUnavailableIssue(context, nodeId));
          continue;
        }
        const current = context.analysisContext.findCurrentSubnetForNode(nodeId);
        if (current.status === 'unassigned' && !isBoundary(context, nodeId)) {
          issues.push(createIssue({
            ...common,
            code: PROPOSAL_ISSUE_CODES.API_BOUNDARY_REMOVE_NODE_ALREADY_UNASSIGNED,
            title: 'API boundary node is already unassigned',
            message: 'This node is unassigned and is not known as an API boundary node in available onchain context.',
            affected: { nodeIds: [nodeId] },
          }));
        }
        if (!isBoundary(context, nodeId)) {
          issues.push(createIssue({
            ...common,
            code: PROPOSAL_ISSUE_CODES.API_BOUNDARY_REMOVE_NODE_NOT_API_BOUNDARY,
            title: 'Node is not known as API boundary',
            message: 'The node is not in the known API boundary node set from available onchain context.',
            affected: { nodeIds: [nodeId] },
          }));
        }
      }
    } else if (context.lifecycle === 'post_execution_success') {
      const nodes = context.intent.actionKind === 'AddApiBoundaryNodes'
        ? context.intent.addNodeIds
        : context.intent.removeNodeIds;
      for (const nodeId of nodes) {
        if (!boundaryIdsKnown) {
          issues.push(membershipUnavailableIssue(context, nodeId));
          continue;
        }
        if (context.intent.actionKind === 'AddApiBoundaryNodes' && !isBoundary(context, nodeId)) {
          issues.push(createIssue({
            ...common,
            code: PROPOSAL_ISSUE_CODES.EXECUTED_ADD_API_BOUNDARY_NODE_NOT_BOUNDARY,
            title: 'Added node is not API boundary',
            message: 'This executed proposal added an API boundary node, but it is not in the current API boundary set.',
            affected: { nodeIds: [nodeId] },
          }));
        }
        if (context.intent.actionKind === 'RemoveApiBoundaryNodes' && isBoundary(context, nodeId)) {
          issues.push(createIssue({
            ...common,
            code: PROPOSAL_ISSUE_CODES.EXECUTED_REMOVE_API_BOUNDARY_NODE_STILL_BOUNDARY,
            title: 'Removed node is still API boundary',
            message: 'This executed proposal removed an API boundary node, but it is still in the current API boundary set.',
            affected: { nodeIds: [nodeId] },
          }));
        }
      }
    }

    return { issues, metrics: {}, dataWarnings: [] };
  },
});
