import { normalizeRegistryRegion } from '../../topology/region-normalizer.js';

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
  const country = (node) => node.normalizedCountryCode
    ?? node.normalizedCountryName
    ?? normalizeRegistryRegion(node.dataCenterRegion).countryCode
    ?? normalizeRegistryRegion(node.dataCenterRegion).countryName;
  const continent = (node) => node.normalizedContinent ?? normalizeRegistryRegion(node.dataCenterRegion).continent;
  return {
    provider: maxBy(nodes.map((node) => node.nodeProviderId)),
    operator: maxBy(nodes.map((node) => node.nodeOperatorId)),
    dataCenter: maxBy(nodes.map((node) => node.dataCenterId)),
    owner: maxBy(nodes.map((node) => node.dataCenterOwner)),
    country: maxBy(nodes.map(country)),
    continent: maxBy(nodes.map(continent)),
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
