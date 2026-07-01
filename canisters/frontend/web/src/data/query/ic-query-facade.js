export function createIcQueryFacade({ backend }) {
  return Object.freeze({
    getNnsNeuron: ({ neuronId }) => backend.getNnsNeuron({ neuronId }),
    getNnsNeurons: ({ neuronIds }) => backend.getNnsNeurons({ neuronIds }),
    getOpenNnsProposals: () => backend.getOpenNnsProposals(),
    getNnsProposal: ({ proposalId }) => backend.getNnsProposal({ proposalId }),
    getIcNodeProviders: () => backend.getIcNodeProviders(),
    getIcSubnet: ({ subnetId }) => backend.getIcSubnet({ subnetId }),
    getIcSubnetDetails: ({ subnetId }) => backend.getIcSubnetDetails({ subnetId }),
    getIcNodeDetails: ({ nodeIds }) => backend.getIcNodeDetails({ nodeIds }),
    getIcSubnets: (options) => backend.getIcSubnets(options),
    getIcSubnetNodeCounts: (options) => backend.getIcSubnetNodeCounts(options),
    getIcTopology: (options) => backend.getIcTopology(options),
    getNodeMetricsHistory: (options) => backend.getNodeMetricsHistory(options),
    getLatestTokenomicsSnapshot: () => backend.getLatestTokenomicsSnapshot(),
    listTokenomicsSnapshots: (options) => backend.listTokenomicsSnapshots(options),
    getApiBoundaryNodeIds: (options) => backend.getApiBoundaryNodeIds(options),
    getCmcSubnetLabels: () => backend.getCmcSubnetLabels(),
    clearTopologyCache: () => backend.clearTopologyCache(),
    refreshIcTopology: () => backend.refreshIcTopology(),
  });
}
