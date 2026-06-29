import {
  applyNodeProposalIntents,
  referencedNodeCandidatesForProposal,
} from './proposal-node-impacts.js';

export function createProposalLoader({ queryFacade }) {
  async function loadOpenProposals() {
    const proposals = await queryFacade.getOpenNnsProposals();
    return [...proposals].sort((left, right) => {
      if (left.createdAtSeconds === right.createdAtSeconds) {
        return left.id < right.id ? -1 : 1;
      }
      return left.createdAtSeconds > right.createdAtSeconds ? -1 : 1;
    });
  }

  async function loadProposal(proposalId) {
    return queryFacade.getNnsProposal({ proposalId });
  }

  async function loadReferencedNodes(proposal) {
    const candidates = referencedNodeCandidatesForProposal(proposal);
    if (candidates.length === 0) {
      return { nodeLocations: [], warnings: [], candidates: [] };
    }
    const result = await queryFacade.getIcNodeDetails({
      nodeIds: candidates.map((candidate) => candidate.nodeId),
    });
    return {
      ...result,
      candidates,
      nodeLocations: applyNodeProposalIntents(result.nodeLocations, candidates),
    };
  }

  return Object.freeze({ loadOpenProposals, loadProposal, loadReferencedNodes });
}
