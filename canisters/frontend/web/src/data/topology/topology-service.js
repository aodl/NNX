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
  normalizeSubnet,
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

function requireSubnetRegistry(registry) {
  if (!registry?.get_subnet) {
    throw new IcTopologyError(
      TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
      'Topology service requires a Registry query actor with get_subnet.',
    );
  }
}

function assertSubnetId(subnetId) {
  if (typeof subnetId !== 'string' || subnetId.length === 0) {
    throw new IcTopologyError(
      TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
      'Subnet reads require a non-empty subnetId string.',
    );
  }
}

async function getSubnet(registry, subnetId) {
  requireSubnetRegistry(registry);
  assertSubnetId(subnetId);

  let principal;
  try {
    principal = Principal.fromText(subnetId);
  } catch (error) {
    throw normalizeTopologyError(
      TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
      'Subnet reads require a valid principal text subnetId.',
      error,
    );
  }

  let response;
  try {
    response = await registry.get_subnet({ subnet_id: [principal] });
  } catch (error) {
    throw normalizeTopologyError(
      TOPOLOGY_ERROR_CODES.REGISTRY_CALL_FAILED,
      'Failed to read Registry subnet record.',
      error,
    );
  }

  if (response?.Err !== undefined) {
    return {
      subnet: null,
      warnings: [topologyWarning(
        TOPOLOGY_ERROR_CODES.REGISTRY_RESPONSE_ERR,
        'Registry returned an error for a subnet query.',
        { subnetId, error: response.Err },
      )],
    };
  }

  if (response?.Ok === undefined) {
    throw new IcTopologyError(
      TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
      'Registry returned an unexpected subnet response.',
    );
  }

  const warnings = [];
  const subnet = normalizeSubnet(response.Ok, subnetId, warnings);
  return { subnet, warnings };
}

function hasKnownSubnetIds(options) {
  return Array.isArray(options?.subnetIds);
}

async function discoverSubnetIds(rawRegistryClient) {
  if (!rawRegistryClient?.listSubnetIds) {
    throw new IcTopologyError(
      TOPOLOGY_ERROR_CODES.RAW_REGISTRY_UNAVAILABLE,
      'Full subnet discovery requires a raw Registry client that can read subnet_list.',
    );
  }

  return rawRegistryClient.listSubnetIds();
}

async function loadKnownSubnets({
  registry,
  subnetIds,
  rawRegistryClient = null,
  maxConcurrency = DEFAULT_MAX_CONCURRENCY,
}) {
  if (!Array.isArray(subnetIds)) subnetIds = await discoverSubnetIds(rawRegistryClient);
  if (subnetIds.length === 0) {
    return { subnets: [], warnings: [] };
  }

  const results = await mapWithConcurrency(
    subnetIds,
    maxConcurrency,
    async (subnetId) => {
      try {
        return await getSubnet(registry, subnetId);
      } catch (error) {
        return {
          subnet: null,
          warnings: [topologyWarning(
            error?.code ?? TOPOLOGY_ERROR_CODES.REGISTRY_CALL_FAILED,
            'Failed to read a known Registry subnet record.',
            { subnetId, message: error?.message ?? String(error) },
          )],
        };
      }
    },
  );

  const subnets = [];
  const warnings = [];
  for (const result of results) {
    warnings.push(...(result?.warnings ?? []));
    if (result?.subnet) subnets.push(result.subnet);
  }

  if (warnings.length > 0 && subnets.length > 0) {
    warnings.push(topologyWarning(
      TOPOLOGY_ERROR_CODES.PARTIAL_TOPOLOGY,
      'Subnet reads returned partial data; one or more known subnet records could not be fully read.',
    ));
  }

  return { subnets, warnings };
}

async function loadNodeRecords(rawRegistryClient, nodeIds, maxConcurrency) {
  if (!rawRegistryClient?.getNodeRecord) {
    return {
      nodeRecords: [],
      warnings: [topologyWarning(
        TOPOLOGY_ERROR_CODES.RAW_REGISTRY_UNAVAILABLE,
        'Subnet node location reads require raw Registry node records.',
      )],
    };
  }

  const results = await mapWithConcurrency(
    nodeIds,
    maxConcurrency,
    async (nodeId) => {
      try {
        return { nodeRecord: await rawRegistryClient.getNodeRecord(nodeId), warnings: [] };
      } catch (error) {
        return {
          nodeRecord: null,
          warnings: [topologyWarning(
            error?.code ?? TOPOLOGY_ERROR_CODES.REGISTRY_CALL_FAILED,
            'Failed to read a Registry node record.',
            { nodeId, message: error?.message ?? String(error) },
          )],
        };
      }
    },
  );

  const nodeRecords = [];
  const warnings = [];
  for (const result of results) {
    warnings.push(...(result?.warnings ?? []));
    if (result?.nodeRecord) nodeRecords.push(result.nodeRecord);
  }

  return { nodeRecords, warnings };
}

function buildNodeLocations(nodeIds, nodeRecords, topology, warnings = [], context = {}) {
  const recordsByNodeId = new Map(nodeRecords.map((record) => [record.nodeId, record]));
  return nodeIds.map((nodeId) => {
    const nodeRecord = recordsByNodeId.get(nodeId) ?? null;
    const nodeOperatorId = nodeRecord?.nodeOperatorId ?? null;
    const nodeOperator = nodeOperatorId ? topology.nodeOperatorsById[nodeOperatorId] ?? null : null;
    const dataCenter = nodeOperator?.dataCenterId
      ? topology.dataCentersById[nodeOperator.dataCenterId] ?? null
      : null;
    if (!nodeOperatorId) {
      warnings.push(topologyWarning(
        TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
        'Registry node record did not include a node operator.',
        { ...context, nodeId },
      ));
    } else if (!nodeOperator) {
      warnings.push(topologyWarning(
        TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
        'Subnet node operator was not found in provider topology metadata.',
        { ...context, nodeId, nodeOperatorId },
      ));
    } else if (!dataCenter) {
      warnings.push(topologyWarning(
        TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
        'Subnet node data center was not found in provider topology metadata.',
        { ...context, nodeId, nodeOperatorId, dataCenterId: nodeOperator.dataCenterId },
      ));
    } else if (!dataCenter.gps) {
      warnings.push(topologyWarning(
        TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
        'Subnet node data center did not include Registry GPS metadata.',
        { ...context, nodeId, nodeOperatorId, dataCenterId: dataCenter.id },
      ));
    }
    return {
      nodeId,
      nodeOperatorId,
      nodeProviderId: nodeOperator?.nodeProviderId ?? null,
      dataCenterId: dataCenter?.id ?? nodeOperator?.dataCenterId ?? null,
      dataCenterRegion: dataCenter?.region ?? null,
      dataCenterOwner: dataCenter?.owner ?? null,
      gps: dataCenter?.gps ?? null,
    };
  });
}

function buildSubnetNodeLocations(subnet, nodeRecords, topology, warnings = []) {
  return buildNodeLocations(subnet.nodeIds, nodeRecords, topology, warnings, { subnetId: subnet.id });
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
  rawRegistryClient = null,
  cache = createTopologyCache(),
  maxConcurrency = DEFAULT_MAX_CONCURRENCY,
} = {}) {
  const fetchTopology = () => loadIcTopology({ governance, registry, maxConcurrency });

  async function getIcTopology(options = {}) {
    const topology = await cache.get(fetchTopology, { refresh: Boolean(options.refresh) });
    if (!hasKnownSubnetIds(options)) return topology;

    const { subnets, warnings } = await loadKnownSubnets({
      registry,
      subnetIds: options.subnetIds,
      rawRegistryClient,
      maxConcurrency,
    });

    return {
      ...topology,
      subnets,
      warnings: [...topology.warnings, ...warnings],
    };
  }

  async function refreshIcTopology() {
    return cache.get(fetchTopology, { refresh: true });
  }

  async function getIcNodeProviders() {
    const response = await listNodeProviders(governance);
    return Object.values(normalizeNodeProviderListResponse(response).nodeProvidersById);
  }

  async function getIcSubnet({ subnetId } = {}) {
    const { subnet } = await getSubnet(registry, subnetId);
    return subnet;
  }

  async function getIcSubnets(options = {}) {
    return loadKnownSubnets({
      registry,
      subnetIds: options.subnetIds,
      rawRegistryClient,
      maxConcurrency,
    });
  }

  async function getIcSubnetNodeCounts(options = {}) {
    const { subnets, warnings } = await getIcSubnets(options);
    const countsBySubnetId = {};

    for (const subnet of subnets) {
      countsBySubnetId[subnet.id] = {
        subnetId: subnet.id,
        nodeCount: subnet.nodeCount,
        nodeIds: subnet.nodeIds,
        type: subnet.type,
        replicaVersionId: subnet.replicaVersionId,
        isHalted: subnet.isHalted,
      };
    }

    return { countsBySubnetId, warnings };
  }

  async function getIcSubnetDetails({ subnetId } = {}) {
    const [topology, subnetResult] = await Promise.all([
      getIcTopology(),
      getSubnet(registry, subnetId),
    ]);
    const subnet = subnetResult.subnet;
    const warnings = [...topology.warnings, ...subnetResult.warnings];

    if (!subnet) {
      return { subnet: null, nodeLocations: [], warnings };
    }

    const nodeRecordResult = await loadNodeRecords(rawRegistryClient, subnet.nodeIds, maxConcurrency);
    warnings.push(...nodeRecordResult.warnings);

    return {
      subnet,
      nodeLocations: buildSubnetNodeLocations(subnet, nodeRecordResult.nodeRecords, topology, warnings),
      dataCentersById: topology.dataCentersById,
      nodeOperatorsById: topology.nodeOperatorsById,
      nodeProvidersById: topology.nodeProvidersById,
      warnings,
    };
  }

  async function getIcNodeDetails({ nodeIds } = {}) {
    const uniqueNodeIds = [...new Set((nodeIds ?? []).filter((nodeId) => (
      typeof nodeId === 'string' && nodeId.length > 0
    )))];
    const topology = await getIcTopology();
    const warnings = [...topology.warnings];

    if (uniqueNodeIds.length === 0) {
      return { nodeLocations: [], warnings };
    }

    const nodeRecordResult = await loadNodeRecords(rawRegistryClient, uniqueNodeIds, maxConcurrency);
    warnings.push(...nodeRecordResult.warnings);

    return {
      nodeLocations: buildNodeLocations(
        nodeRecordResult.nodeRecords.map((record) => record.nodeId),
        nodeRecordResult.nodeRecords,
        topology,
        warnings,
      ),
      warnings,
    };
  }

  function clearTopologyCache() {
    cache.clear();
  }

  return Object.freeze({
    getIcTopology,
    getIcNodeProviders,
    getIcSubnet,
    getIcSubnets,
    getIcSubnetNodeCounts,
    getIcSubnetDetails,
    getIcNodeDetails,
    refreshIcTopology,
    clearTopologyCache,
  });
}
