import { normalizeRegistryRegion } from '../../topology/region-normalizer.js';

function uniqueCount(values) {
  return new Set(values.filter((value) => typeof value === 'string' && value.length > 0)).size;
}

function normalizedCountry(node) {
  return node.normalizedCountryCode
    ?? node.normalizedCountryName
    ?? normalizeRegistryRegion(node.dataCenterRegion).countryCode
    ?? normalizeRegistryRegion(node.dataCenterRegion).countryName;
}

function normalizedContinent(node) {
  return node.normalizedContinent ?? normalizeRegistryRegion(node.dataCenterRegion).continent;
}

export function diversityCounts(nodeIds = [], nodesById = {}) {
  const nodes = nodeIds.map((nodeId) => nodesById[nodeId]).filter(Boolean);
  return {
    countries: uniqueCount(nodes.map((node) => normalizedCountry(node))),
    continents: uniqueCount(nodes.map((node) => normalizedContinent(node))),
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
