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

  return Object.freeze({ loadOpenProposals, loadProposal });
}
