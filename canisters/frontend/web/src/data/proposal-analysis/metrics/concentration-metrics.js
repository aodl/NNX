function countryFromRegion(region) {
  if (typeof region !== 'string' || region.length === 0) return null;
  const parts = region.split(',').map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? region;
}

function maxBy(values) {
  const counts = new Map();
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let max = 0;
  let id = null;
  for (const [key, count] of counts) {
    if (count > max) {
      max = count;
      id = key;
    }
  }
  return { id, count: max };
}

function concentrationCounts(nodeIds, nodesById) {
  const nodes = nodeIds.map((nodeId) => nodesById[nodeId]).filter(Boolean);
  return {
    provider: maxBy(nodes.map((node) => node.nodeProviderId)),
    operator: maxBy(nodes.map((node) => node.nodeOperatorId)),
    dataCenter: maxBy(nodes.map((node) => node.dataCenterId)),
    owner: maxBy(nodes.map((node) => node.dataCenterOwner)),
    country: maxBy(nodes.map((node) => countryFromRegion(node.dataCenterRegion))),
  };
}

export function computeConcentrationMetric({ beforeNodeIds = [], afterNodeIds = [], nodesById = {} } = {}) {
  const before = concentrationCounts(beforeNodeIds, nodesById);
  const after = concentrationCounts(afterNodeIds, nodesById);
  const deltas = {};
  for (const key of Object.keys(before)) {
    deltas[key] = after[key].count - before[key].count;
  }
  return { before, after, deltas };
}
