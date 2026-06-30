import assert from 'node:assert/strict';
import test from 'node:test';
import { apiBoundaryNodeAnalyzer } from '../src/data/proposal-analysis/analyzers/api-boundary-node-analyzer.js';
import { createSubnetAnalyzer } from '../src/data/proposal-analysis/analyzers/create-subnet-analyzer.js';
import { dfinityProviderAnalyzer } from '../src/data/proposal-analysis/analyzers/dfinity-provider-analyzer.js';
import { nodeConflictAnalyzer } from '../src/data/proposal-analysis/analyzers/node-conflict-analyzer.js';
import { nodeMetricsAnalyzer } from '../src/data/proposal-analysis/analyzers/node-metrics-analyzer.js';
import { subnetMembershipAnalyzer } from '../src/data/proposal-analysis/analyzers/subnet-membership-analyzer.js';
import { DFINITY_NODE_PROVIDER_ID } from '../src/data/proposal-analysis/analysis-policy.js';
import { PROPOSAL_ISSUE_CODES } from '../src/data/proposal-analysis/issue-codes.js';

function ctx(overrides = {}) {
  const subnets = overrides.subnets ?? {
    subnetA: ['a', 'remove'],
    subnetB: ['assigned'],
  };
  const nodesById = overrides.nodesById ?? {
    a: { id: 'a', nodeId: 'a', nodeProviderId: 'p1', dataCenterId: 'dc1' },
    assigned: { id: 'assigned', nodeId: 'assigned', nodeProviderId: 'p2', dataCenterId: 'dc2' },
    remove: { id: 'remove', nodeId: 'remove', nodeProviderId: 'p3', dataCenterId: 'dc3' },
    missingDomain: { id: 'missingDomain', nodeId: 'missingDomain', publicIpv4: { ipAddr: '1.2.3.4' } },
    missingIpv4: { id: 'missingIpv4', nodeId: 'missingIpv4', domain: 'node.example.com' },
  };
  const findCurrentSubnetForNode = (nodeId) => {
    const matches = Object.entries(subnets)
      .filter(([, nodeIds]) => nodeIds.includes(nodeId))
      .map(([subnetId]) => subnetId);
    if (matches.length === 1) return { status: 'assigned', subnetId: matches[0], subnetIds: matches };
    if (matches.length === 0) return { status: 'unassigned', subnetId: null, subnetIds: [] };
    return { status: 'ambiguous', subnetId: null, subnetIds: matches };
  };
  return {
    lifecycle: overrides.lifecycle ?? 'pre_execution',
    intent: {
      proposalId: 1n,
      actionKind: 'ChangeSubnetMembership',
      targetSubnetId: 'subnetA',
      addNodeIds: [],
      removeNodeIds: [],
      allNodeIds: [],
      ...overrides.intent,
    },
    stateChange: overrides.stateChange ?? { beforeNodeIds: [], afterNodeIds: [] },
    analysisContext: {
      nodesById,
      apiBoundaryNodeIds: overrides.apiBoundaryNodeIds ?? [],
      apiBoundaryMembershipAvailable: overrides.apiBoundaryMembershipAvailable
        ?? Boolean(overrides.apiBoundaryNodeIds?.length),
      nodeHealthMetrics: overrides.nodeHealthMetrics ?? null,
      nodeHealthMetricsByNodeId: overrides.nodeHealthMetricsByNodeId ?? {},
      openProposals: [],
      findCurrentSubnetForNode,
    },
    openIntents: overrides.openIntents ?? [],
  };
}

function codes(result) {
  return result.issues.map((issue) => issue.code);
}

test('subnet membership precondition checks add and remove nodes', () => {
  assert.ok(codes(subnetMembershipAnalyzer.analyze(ctx({
    intent: { addNodeIds: ['assigned'], allNodeIds: ['assigned'] },
  }))).includes(PROPOSAL_ISSUE_CODES.ADD_NODE_ALREADY_ASSIGNED));
  assert.ok(codes(subnetMembershipAnalyzer.analyze(ctx({
    intent: { addNodeIds: ['a'], allNodeIds: ['a'] },
  }))).includes(PROPOSAL_ISSUE_CODES.ADD_NODE_ALREADY_IN_TARGET_SUBNET));
  assert.ok(codes(subnetMembershipAnalyzer.analyze(ctx({
    intent: { removeNodeIds: ['unassigned'], allNodeIds: ['unassigned'] },
  }))).includes(PROPOSAL_ISSUE_CODES.REMOVE_NODE_ALREADY_UNASSIGNED));
  assert.ok(codes(subnetMembershipAnalyzer.analyze(ctx({
    intent: { removeNodeIds: ['assigned'], allNodeIds: ['assigned'] },
  }))).includes(PROPOSAL_ISSUE_CODES.REMOVE_NODE_NOT_IN_TARGET_SUBNET));
});

test('subnet membership postcondition checks executed proposals only', () => {
  assert.deepEqual(codes(subnetMembershipAnalyzer.analyze(ctx({
    lifecycle: 'post_execution_success',
    intent: { addNodeIds: ['a'], allNodeIds: ['a'] },
  }))), []);
  assert.ok(codes(subnetMembershipAnalyzer.analyze(ctx({
    lifecycle: 'post_execution_success',
    intent: { addNodeIds: ['unassigned'], allNodeIds: ['unassigned'] },
  }))).includes(PROPOSAL_ISSUE_CODES.EXECUTED_ADD_NODE_STILL_UNASSIGNED));
  assert.ok(codes(subnetMembershipAnalyzer.analyze(ctx({
    lifecycle: 'post_execution_success',
    intent: { addNodeIds: ['assigned'], allNodeIds: ['assigned'] },
  }))).includes(PROPOSAL_ISSUE_CODES.EXECUTED_ADD_NODE_IN_WRONG_SUBNET));
  assert.ok(codes(subnetMembershipAnalyzer.analyze(ctx({
    lifecycle: 'post_execution_success',
    intent: { removeNodeIds: ['a'], allNodeIds: ['a'] },
  }))).includes(PROPOSAL_ISSUE_CODES.EXECUTED_REMOVE_NODE_STILL_IN_TARGET_SUBNET));
  assert.deepEqual(codes(subnetMembershipAnalyzer.analyze(ctx({
    lifecycle: 'rejected',
    intent: { addNodeIds: ['assigned'], allNodeIds: ['assigned'] },
  }))), []);
});

test('node appears in add and remove in same proposal', () => {
  assert.ok(codes(subnetMembershipAnalyzer.analyze(ctx({
    intent: { addNodeIds: ['a'], removeNodeIds: ['a'], allNodeIds: ['a'] },
  }))).includes(PROPOSAL_ISSUE_CODES.NODE_ADDED_AND_REMOVED_IN_SAME_PROPOSAL));
});

test('create subnet checks assigned nodes and unresolved postcondition', () => {
  assert.ok(codes(createSubnetAnalyzer.analyze(ctx({
    intent: { actionKind: 'CreateSubnet', addNodeIds: ['a'], allNodeIds: ['a'] },
  }))).includes(PROPOSAL_ISSUE_CODES.CREATE_SUBNET_NODE_ALREADY_ASSIGNED));
  assert.deepEqual(codes(createSubnetAnalyzer.analyze(ctx({
    intent: { actionKind: 'CreateSubnet', addNodeIds: ['new'], allNodeIds: ['new'] },
    nodesById: { new: { id: 'new', nodeId: 'new' } },
  }))), []);
  assert.equal(createSubnetAnalyzer.analyze(ctx({
    lifecycle: 'post_execution_success',
    intent: { actionKind: 'CreateSubnet', targetSubnetId: null, addNodeIds: ['new'], allNodeIds: ['new'] },
  })).issues[0].severity, 'manual_review');
});

test('API boundary checks domain IPv4 assignment and postconditions', () => {
  assert.ok(codes(apiBoundaryNodeAnalyzer.analyze(ctx({
    intent: { actionKind: 'AddApiBoundaryNodes', addNodeIds: ['assigned'], allNodeIds: ['assigned'] },
  }))).includes(PROPOSAL_ISSUE_CODES.API_BOUNDARY_ADD_NODE_ALREADY_ASSIGNED));
  assert.ok(codes(apiBoundaryNodeAnalyzer.analyze(ctx({
    intent: { actionKind: 'AddApiBoundaryNodes', addNodeIds: ['missingDomain'], allNodeIds: ['missingDomain'] },
  }))).includes(PROPOSAL_ISSUE_CODES.API_BOUNDARY_ADD_NODE_MISSING_DOMAIN));
  assert.ok(codes(apiBoundaryNodeAnalyzer.analyze(ctx({
    intent: { actionKind: 'AddApiBoundaryNodes', addNodeIds: ['missingIpv4'], allNodeIds: ['missingIpv4'] },
  }))).includes(PROPOSAL_ISSUE_CODES.API_BOUNDARY_ADD_NODE_MISSING_IPV4));
  assert.ok(codes(apiBoundaryNodeAnalyzer.analyze(ctx({
    intent: { actionKind: 'RemoveApiBoundaryNodes', removeNodeIds: ['missingDomain'], allNodeIds: ['missingDomain'] },
  }))).includes(PROPOSAL_ISSUE_CODES.API_BOUNDARY_MEMBERSHIP_UNAVAILABLE));
  assert.ok(codes(apiBoundaryNodeAnalyzer.analyze(ctx({
    apiBoundaryNodeIds: ['otherBoundary'],
    intent: { actionKind: 'RemoveApiBoundaryNodes', removeNodeIds: ['missingDomain'], allNodeIds: ['missingDomain'] },
  }))).includes(PROPOSAL_ISSUE_CODES.API_BOUNDARY_REMOVE_NODE_ALREADY_UNASSIGNED));
  assert.ok(codes(apiBoundaryNodeAnalyzer.analyze(ctx({
    lifecycle: 'post_execution_success',
    nodesById: { added: { id: 'added', nodeId: 'added' } },
    intent: { actionKind: 'AddApiBoundaryNodes', addNodeIds: ['added'], allNodeIds: ['added'] },
  }))).includes(PROPOSAL_ISSUE_CODES.API_BOUNDARY_MEMBERSHIP_UNAVAILABLE));
  assert.ok(codes(apiBoundaryNodeAnalyzer.analyze(ctx({
    lifecycle: 'post_execution_success',
    apiBoundaryNodeIds: ['stillBoundary'],
    apiBoundaryMembershipAvailable: true,
    nodesById: { stillBoundary: { id: 'stillBoundary', nodeId: 'stillBoundary' } },
    intent: { actionKind: 'RemoveApiBoundaryNodes', removeNodeIds: ['stillBoundary'], allNodeIds: ['stillBoundary'] },
  }))).includes(PROPOSAL_ISSUE_CODES.API_BOUNDARY_EXECUTED_REMOVE_NODE_STILL_BOUNDARY));
});

test('API boundary certified empty membership is treated as available', () => {
  const result = apiBoundaryNodeAnalyzer.analyze(ctx({
    apiBoundaryNodeIds: [],
    apiBoundaryMembershipAvailable: true,
    nodesById: { candidate: { id: 'candidate', nodeId: 'candidate' } },
    intent: { actionKind: 'RemoveApiBoundaryNodes', removeNodeIds: ['candidate'], allNodeIds: ['candidate'] },
  }));
  assert.ok(codes(result).includes(PROPOSAL_ISSUE_CODES.API_BOUNDARY_REMOVE_NODE_NOT_API_BOUNDARY));
  assert.equal(codes(result).includes(PROPOSAL_ISSUE_CODES.API_BOUNDARY_MEMBERSHIP_UNAVAILABLE), false);
});

test('DFINITY provider warning fires only when count drops to zero', () => {
  const result = dfinityProviderAnalyzer.analyze(ctx({
    nodesById: {
      d: { id: 'd', nodeId: 'd', nodeProviderId: DFINITY_NODE_PROVIDER_ID },
      other: { id: 'other', nodeId: 'other', nodeProviderId: 'p' },
    },
    stateChange: { beforeNodeIds: ['d'], afterNodeIds: ['other'] },
  }));
  assert.equal(result.metrics.dfinityProvider.delta, -1);
  assert.ok(codes(result).includes(PROPOSAL_ISSUE_CODES.DFINITY_PROVIDER_REMOVED_FROM_SUBNET));
  assert.deepEqual(codes(dfinityProviderAnalyzer.analyze(ctx({
    nodesById: { other: { id: 'other', nodeId: 'other', nodeProviderId: 'p' } },
    stateChange: { beforeNodeIds: ['other'], afterNodeIds: ['other'] },
  }))), []);
});

test('node conflict detects multiple open proposals', () => {
  const result = nodeConflictAnalyzer.analyze(ctx({
    intent: { proposalId: 1n, allNodeIds: ['a'], addNodeIds: ['a'] },
    openIntents: [
      { proposalId: 1n, allNodeIds: ['a'], addNodeIds: ['a'], removeNodeIds: [] },
      { proposalId: 2n, allNodeIds: ['a'], addNodeIds: [], removeNodeIds: ['a'] },
    ],
  }));
  assert.equal(result.issues[0].severity, 'critical');
});

test('node metrics analyzer emits measured remove-node evidence', () => {
  const result = nodeMetricsAnalyzer.analyze(ctx({
    intent: { actionKind: 'RemoveNodesFromSubnet', removeNodeIds: ['remove'], allNodeIds: ['remove'] },
    nodeHealthMetrics: { subnetId: 'subnetA', windowHours: 24, summary: { elevated_failure_signal: 1 }, errors: [] },
    nodeHealthMetricsByNodeId: {
      remove: {
        nodeId: 'remove',
        windowHours: 24,
        proposedDelta: 10,
        failedDelta: 3,
        failureRate: 0.23,
        sampleSize: 13,
        healthSignal: 'elevated_failure_signal',
      },
    },
  }));
  assert.ok(codes(result).includes(PROPOSAL_ISSUE_CODES.REMOVE_NODE_HAS_ELEVATED_FAILURE_SIGNAL));
  assert.ok(codes(result).includes(PROPOSAL_ISSUE_CODES.SUBNET_NODE_FAILURE_SIGNAL_SUMMARY));
});

test('node metrics analyzer phrases absence of evidence without overclaiming', () => {
  const result = nodeMetricsAnalyzer.analyze(ctx({
    intent: { actionKind: 'RemoveNodesFromSubnet', removeNodeIds: ['remove'], allNodeIds: ['remove'] },
    nodeHealthMetrics: { subnetId: 'subnetA', windowHours: 24, summary: {}, errors: [] },
    nodeHealthMetricsByNodeId: {
      remove: {
        nodeId: 'remove',
        windowHours: 24,
        proposedDelta: 20,
        failedDelta: 0,
        failureRate: 0,
        sampleSize: 20,
        healthSignal: 'healthy_signal',
      },
    },
  }));
  const issue = result.issues.find((item) => item.code === PROPOSAL_ISSUE_CODES.REMOVE_NODE_HAS_NO_ELEVATED_FAILURE_SIGNAL);
  assert.match(issue.message, /did not observe an elevated failure signal/);
});
