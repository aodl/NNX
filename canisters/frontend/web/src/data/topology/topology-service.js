import { Principal } from '@icp-sdk/core/principal';
import { createTopologyCache } from './topology-cache.js';
import {
  TOPOLOGY_ERROR_CODES,
  IcTopologyError,
  normalizeTopologyError,
  topologyWarning,
} from './topology-errors.js';
import {
  createEmptyTopology,
  mergeProviderRegistryResponse,
  normalizeNodeProviderListResponse,
} from './topology-normalizers.js';

const DEFAULT_MAX_CONCURRENCY = 8;

export async function mapWithConcurrency(items, maxConcurrency, mapper) {
  const limit = Math.max(1, Number(maxConcurrency) || DEFAULT_MAX_CONCURRENCY);
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function listNodeProviders(governance) {
  try {
    return await governance.list_node_providers();
  } catch (error) {
    throw normalizeTopologyError(
      TOPOLOGY_ERROR_CODES.GOVERNANCE_CALL_FAILED,
      'Failed to read NNS node providers from Governance.',
      error,
    );
  }
}

async function getProviderTopology(registry, providerId) {
  try {
    return {
      providerId,
      response: await registry.get_node_operators_and_dcs_of_node_provider(Principal.fromText(providerId)),
    };
  } catch (error) {
    return {
      providerId,
      warning: topologyWarning(
        TOPOLOGY_ERROR_CODES.REGISTRY_CALL_FAILED,
        'Failed to read Registry node operators and data centers for a node provider.',
        { providerId, message: error?.message ?? String(error) },
      ),
    };
  }
}

export async function loadIcTopology({ governance, registry, maxConcurrency = DEFAULT_MAX_CONCURRENCY } = {}) {
  if (!governance?.list_node_providers || !registry?.get_node_operators_and_dcs_of_node_provider) {
    throw new IcTopologyError(
      TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
      'Topology service requires Governance and Registry query actors.',
    );
  }

  const providerResponse = await listNodeProviders(governance);
  const { nodeProvidersById, warnings } = normalizeNodeProviderListResponse(providerResponse);
  const topology = createEmptyTopology({ warnings });
  topology.nodeProvidersById = nodeProvidersById;

  const providerIds = Object.keys(nodeProvidersById);
  if (providerIds.length === 0) {
    topology.warnings.push(topologyWarning(
      TOPOLOGY_ERROR_CODES.PARTIAL_TOPOLOGY,
      'Governance returned no node providers.',
    ));
    return topology;
  }

  const responses = await mapWithConcurrency(
    providerIds,
    maxConcurrency,
    (providerId) => getProviderTopology(registry, providerId),
  );

  let successfulProviderReads = 0;
  for (const result of responses) {
    if (result?.warning) {
      topology.warnings.push(result.warning);
      continue;
    }
    if (mergeProviderRegistryResponse(topology, result.response, result.providerId)) {
      successfulProviderReads += 1;
    }
  }

  if (successfulProviderReads === 0) {
    throw new IcTopologyError(
      TOPOLOGY_ERROR_CODES.REGISTRY_CALL_FAILED,
      'Failed to read topology data for every node provider.',
    );
  }

  if (successfulProviderReads < providerIds.length || topology.warnings.length > 0) {
    topology.warnings.push(topologyWarning(
      TOPOLOGY_ERROR_CODES.PARTIAL_TOPOLOGY,
      'Topology contains partial data; one or more provider records could not be fully read.',
    ));
  }

  return topology;
}

export function createTopologyService({
  governance,
  registry,
  cache = createTopologyCache(),
  maxConcurrency = DEFAULT_MAX_CONCURRENCY,
} = {}) {
  const fetchTopology = () => loadIcTopology({ governance, registry, maxConcurrency });

  async function getIcTopology(options = {}) {
    return cache.get(fetchTopology, { refresh: Boolean(options.refresh) });
  }

  async function refreshIcTopology() {
    return cache.get(fetchTopology, { refresh: true });
  }

  async function getIcNodeProviders() {
    const response = await listNodeProviders(governance);
    return Object.values(normalizeNodeProviderListResponse(response).nodeProvidersById);
  }

  function clearTopologyCache() {
    cache.clear();
  }

  return Object.freeze({
    getIcTopology,
    getIcNodeProviders,
    refreshIcTopology,
    clearTopologyCache,
  });
}
