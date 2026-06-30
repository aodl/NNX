import {
  applyNodeProposalIntents,
  referencedNodeCandidatesForProposal,
} from './proposal-node-impacts.js';
import { createRequestCache } from './request-cache.js';

export function createProposalLoader({ queryFacade }) {
  const analysisService = queryFacade?.analyzeOpenProposals ? queryFacade : null;
  const cache = createRequestCache({
    debug: globalThis.localStorage?.getItem?.('nnxDebug') === '1',
  });

  async function loadOpenProposals() {
    const proposals = await cache.get('open-proposals', () => queryFacade.getOpenNnsProposals());
    let analysesById = new Map();
    if (analysisService) {
      const analyses = await cache.get('open-proposal-analyses', () => (
        analysisService.analyzeOpenProposals({ mode: 'summary' }).catch(() => [])
      ));
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
    const proposal = await cache.get(`proposal:${proposalId}`, () => queryFacade.getNnsProposal({ proposalId }));
    if (!proposal || !analysisService) return proposal;
    const analysis = await cache.get(`proposal-analysis:${proposalId}`, () => (
      analysisService.analyzeProposalObject({ proposal, mode: 'full' }).catch(() => null)
    ));
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
