import {
  applyNodeProposalIntents,
  referencedNodeCandidatesForProposal,
} from './proposal-node-impacts.js';

export function createProposalLoader({ queryFacade }) {
  const analysisService = queryFacade?.analyzeOpenProposals ? queryFacade : null;

  async function loadOpenProposals() {
    const proposals = await queryFacade.getOpenNnsProposals();
    let analysesById = new Map();
    if (analysisService) {
      const analyses = await analysisService.analyzeOpenProposals().catch(() => []);
      analysesById = new Map(analyses.map((analysis) => [analysis.proposalId?.toString(), analysis]));
    }
    return proposals.map((proposal) => ({
      ...proposal,
      analysis: analysesById.get(proposal.id?.toString()) ?? null,
    })).sort((left, right) => {
      if (left.createdAtSeconds === right.createdAtSeconds) {
        return left.id < right.id ? -1 : 1;
      }
      return left.createdAtSeconds > right.createdAtSeconds ? -1 : 1;
    });
  }

  async function loadProposal(proposalId) {
    const proposal = await queryFacade.getNnsProposal({ proposalId });
    if (!proposal || !analysisService) return proposal;
    const analysis = await analysisService.analyzeProposalObject({ proposal }).catch(() => null);
    return { ...proposal, analysis };
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
