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
