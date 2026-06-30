function uniqueCount(values) {
  return new Set(values.filter((value) => typeof value === 'string' && value.length > 0)).size;
}

function countryFromRegion(region) {
  if (typeof region !== 'string' || region.length === 0) return null;
  const parts = region.split(',').map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? region;
}

export function diversityCounts(nodeIds = [], nodesById = {}) {
  const nodes = nodeIds.map((nodeId) => nodesById[nodeId]).filter(Boolean);
  return {
    countries: uniqueCount(nodes.map((node) => countryFromRegion(node.dataCenterRegion))),
    nodeProviders: uniqueCount(nodes.map((node) => node.nodeProviderId)),
    nodeOperators: uniqueCount(nodes.map((node) => node.nodeOperatorId)),
    dataCenters: uniqueCount(nodes.map((node) => node.dataCenterId)),
    owners: uniqueCount(nodes.map((node) => node.dataCenterOwner)),
  };
}

export function computeDiversityMetric({ beforeNodeIds = [], afterNodeIds = [], nodesById = {} } = {}) {
  const before = diversityCounts(beforeNodeIds, nodesById);
  const after = diversityCounts(afterNodeIds, nodesById);
  return {
    before,
    after,
    deltas: Object.fromEntries(
      Object.keys(before).map((key) => [key, after[key] - before[key]]),
    ),
  };
}
