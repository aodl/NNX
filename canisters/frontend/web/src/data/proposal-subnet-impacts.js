export function proposalIdentifier(proposal) {
  return proposal?.id?.toString?.() ?? String(proposal?.id ?? '');
}

export function proposalPayloadText(proposal) {
  return [
    proposal?.payloadSearchText,
    proposal?.actionDescription,
    proposal?.actionDetails,
    ...(proposal?.actionValues ?? []).flatMap((item) => [item.name, item.value]),
  ]
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join('\n');
}

export function proposalReferencesSubnet(proposal, subnetId) {
  return typeof subnetId === 'string'
    && subnetId.length > 0
    && proposalPayloadText(proposal).includes(subnetId);
}

export function affectedProposalsForSubnet(subnetId, proposals) {
  const byProposalId = new Map();
  for (const proposal of proposals ?? []) {
    if (proposalReferencesSubnet(proposal, subnetId)) {
      byProposalId.set(proposalIdentifier(proposal), proposal);
    }
  }
  return [...byProposalId.values()];
}

export function countAffectedProposalsForSubnet(subnetId, proposals) {
  return affectedProposalsForSubnet(subnetId, proposals).length;
}

export function referencedSubnetsForProposal(proposal, subnets) {
  const payloadText = proposalPayloadText(proposal);
  const bySubnetId = new Map();
  for (const subnet of subnets ?? []) {
    if (typeof subnet?.id === 'string' && subnet.id.length > 0 && payloadText.includes(subnet.id)) {
      bySubnetId.set(subnet.id, subnet);
    }
  }
  return [...bySubnetId.values()];
}

export function annotateSubnetsWithProposalImpacts(subnetPanelData, proposals) {
  const countsBySubnetId = new Map();
  for (const subnet of subnetPanelData.subnets ?? []) {
    countsBySubnetId.set(
      subnet.id,
      countAffectedProposalsForSubnet(subnet.id, proposals),
    );
  }

  const annotateSubnet = (subnet) => ({
    ...subnet,
    affectedProposalCount: countsBySubnetId.get(subnet.id) ?? 0,
  });

  return {
    ...subnetPanelData,
    subnets: (subnetPanelData.subnets ?? []).map(annotateSubnet),
    groups: (subnetPanelData.groups ?? []).map((group) => {
      const affectedProposalIds = new Set();
      for (const subnet of group.subnets ?? []) {
        for (const proposal of proposals ?? []) {
          if (proposalReferencesSubnet(proposal, subnet.id)) {
            affectedProposalIds.add(proposalIdentifier(proposal));
          }
        }
      }
      return {
        ...group,
        affectedProposalCount: affectedProposalIds.size,
        subnets: (group.subnets ?? []).map(annotateSubnet),
      };
    }),
  };
}
