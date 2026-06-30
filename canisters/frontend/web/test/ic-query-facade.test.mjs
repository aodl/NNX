import assert from 'node:assert/strict';
import test from 'node:test';

import { createIcQueryFacade } from '../src/data/query/ic-query-facade.js';

test('query facade exposes API boundary membership through single boundary method', async () => {
  const facade = createIcQueryFacade({
    backend: {
      getNnsNeuron: async () => null,
      getNnsNeurons: async () => [],
      getOpenNnsProposals: async () => [],
      getNnsProposal: async () => null,
      getIcNodeProviders: async () => [],
      getIcSubnet: async () => null,
      getIcSubnetDetails: async () => ({}),
      getIcNodeDetails: async () => ({}),
      getIcSubnets: async () => [],
      getIcSubnetNodeCounts: async () => ({}),
      getIcTopology: async () => ({}),
      getNodeMetricsHistory: async () => ({}),
      getApiBoundaryNodeIds: async ({ nodeIds }) => ({ apiBoundaryNodeIds: nodeIds, available: true, warnings: [] }),
      getCmcSubnetLabels: async () => ({}),
      clearTopologyCache: () => {},
      refreshIcTopology: async () => ({}),
    },
  });

  const result = await facade.getApiBoundaryNodeIds({ nodeIds: ['2vxsx-fae'] });
  assert.deepEqual(result, {
    apiBoundaryNodeIds: ['2vxsx-fae'],
    available: true,
    warnings: [],
  });
});
