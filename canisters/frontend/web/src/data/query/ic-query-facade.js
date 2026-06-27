export function createIcQueryFacade({ backend }) {
  return Object.freeze({
    getNnsNeuron: ({ neuronId }) => backend.getNnsNeuron({ neuronId }),
    getNnsNeurons: ({ neuronIds }) => backend.getNnsNeurons({ neuronIds }),
    getOpenNnsProposals: () => backend.getOpenNnsProposals(),
    getNnsProposal: ({ proposalId }) => backend.getNnsProposal({ proposalId }),
    getIcNodeProviders: () => backend.getIcNodeProviders(),
    getIcTopology: (options) => backend.getIcTopology(options),
    clearTopologyCache: () => backend.clearTopologyCache(),
    refreshIcTopology: () => backend.refreshIcTopology(),
  });
}
