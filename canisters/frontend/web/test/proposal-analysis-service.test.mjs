import assert from 'node:assert/strict';
import test from 'node:test';
import { createProposalAnalysisService } from '../src/data/proposal-analysis/index.js';

const nodeA = '2vxsx-fae';
const nodeB = 'uuc56-gyb';
const nodeC = 'aaaaa-aa';
const subnetId = 'w7x7r-cok77-xa';

function nodeLocation(nodeId, provider, latitude, longitude) {
  return {
    nodeId,
    nodeProviderId: provider,
    nodeOperatorId: `${provider}-operator`,
    dataCenterId: `${provider}-dc`,
    dataCenterOwner: `${provider}-owner`,
    dataCenterRegion: `${provider.toUpperCase()}, US`,
    gps: { latitude, longitude },
  };
}

test('RemoveNodesFromSubnet infers target subnet before loading metric context', async () => {
  const nodeLocationsById = {
    [nodeA]: nodeLocation(nodeA, 'provider-a', 40, -74),
    [nodeB]: nodeLocation(nodeB, 'provider-b', 41, -73),
    [nodeC]: nodeLocation(nodeC, 'provider-c', 42, -72),
  };
  const requestedNodeBatches = [];
  const queryFacade = {
    getOpenNnsProposals: async () => [],
    getIcSubnets: async () => [{ id: subnetId, nodeIds: [nodeA, nodeB, nodeC] }],
    getIcTopology: async () => ({}),
    getCmcSubnetLabels: async () => ({}),
    getIcNodeDetails: async ({ nodeIds }) => {
      requestedNodeBatches.push(nodeIds);
      return {
        nodeLocations: nodeIds.map((nodeId) => nodeLocationsById[nodeId]).filter(Boolean),
        warnings: [],
      };
    },
  };
  const analysisService = createProposalAnalysisService({ queryFacade });

  const analysis = await analysisService.analyzeProposalObject({
    proposal: {
      id: 10n,
      statusKind: 'Open',
      actionTypeName: 'RemoveNodesFromSubnet',
      actionValues: [{ name: 'nodes', value: nodeA }],
    },
  });

  assert.deepEqual(requestedNodeBatches[0].sort(), [nodeA, nodeB, nodeC].sort());
  assert.equal(analysis.stateChange.beforeNodeIds.length, 3);
  assert.equal(analysis.stateChange.afterNodeIds.length, 2);
  assert.equal(analysis.metrics.diversity.before.nodeProviders, 3);
  assert.equal(analysis.metrics.diversity.after.nodeProviders, 2);
  assert.equal(analysis.metrics.distance.before.pairCount, 3);
});

function removeNodeProposal(id = 11n) {
  return {
    id,
    statusKind: 'Open',
    actionTypeName: 'RemoveNodesFromSubnet',
    actionValues: [{ name: 'nodes', value: nodeA }],
  };
}

function nonRemoveProposal(id = 12n) {
  return {
    id,
    statusKind: 'Open',
    actionTypeName: 'BlessReplicaVersion',
    actionValues: [],
  };
}

function queryFacadeForModeTests({ proposals = [removeNodeProposal()], metricsResult = null } = {}) {
  let metricsCalls = 0;
  return {
    get metricsCalls() {
      return metricsCalls;
    },
    getOpenNnsProposals: async () => proposals,
    getNnsProposal: async () => proposals[0] ?? null,
    getIcSubnets: async () => [{ id: subnetId, nodeIds: [nodeA, nodeB] }],
    getIcTopology: async () => ({}),
    getCmcSubnetLabels: async () => ({}),
    getIcNodeDetails: async ({ nodeIds }) => ({
      nodeLocations: nodeIds.map((nodeId) => nodeLocation(nodeId, `provider-${nodeId}`, 40, -74)),
      warnings: [],
    }),
    getIcSubnetDetails: async () => ({ subnet: { id: subnetId, nodeIds: [nodeA, nodeB] } }),
    getNodeMetricsHistory: async () => {
      metricsCalls += 1;
      return metricsResult ?? {
        subnetId,
        startAtTimestampNanos: 1n,
        endAtTimestampNanos: 2n,
        records: [],
        partial: false,
        errors: [],
      };
    },
  };
}

test('analyzeOpenProposals summary mode does not call node metrics', async () => {
  const queryFacade = queryFacadeForModeTests();
  const analysisService = createProposalAnalysisService({ queryFacade });
  await analysisService.analyzeOpenProposals({ mode: 'summary' });
  assert.equal(queryFacade.metricsCalls, 0);
});

test('proposal detail full mode calls node metrics for remove-node proposal only', async () => {
  const queryFacade = queryFacadeForModeTests({ proposals: [removeNodeProposal()] });
  const analysisService = createProposalAnalysisService({ queryFacade });
  await analysisService.analyzeProposalObject({ proposal: removeNodeProposal(), mode: 'full' });
  assert.equal(queryFacade.metricsCalls, 1);
});

test('non-remove proposals never call node metrics', async () => {
  const queryFacade = queryFacadeForModeTests({ proposals: [nonRemoveProposal()] });
  const analysisService = createProposalAnalysisService({ queryFacade });
  await analysisService.analyzeProposalObject({ proposal: nonRemoveProposal(), mode: 'full' });
  assert.equal(queryFacade.metricsCalls, 0);
});

test('failed metrics call produces manual-review issue without crashing', async () => {
  const queryFacade = queryFacadeForModeTests({
    metricsResult: {
      subnetId,
      startAtTimestampNanos: 1n,
      endAtTimestampNanos: 2n,
      records: [],
      partial: true,
      errors: [{ code: 'MANAGEMENT_CANISTER_CALL_FAILED', message: 'unsupported' }],
    },
  });
  const analysisService = createProposalAnalysisService({ queryFacade });
  const analysis = await analysisService.analyzeProposalObject({ proposal: removeNodeProposal(), mode: 'full' });
  assert.equal(queryFacade.metricsCalls, 1);
  assert.equal(analysis.summary.manualReviewCount > 0, true);
});
