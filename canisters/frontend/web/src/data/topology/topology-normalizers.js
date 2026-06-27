import { Principal } from '@icp-sdk/core/principal';
import { TOPOLOGY_ERROR_CODES, topologyWarning } from './topology-errors.js';

function unwrapOpt(value) {
  return Array.isArray(value) ? (value[0] ?? null) : value ?? null;
}

function bytes(value) {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value);
  return null;
}

function bytesToHex(value) {
  const data = bytes(value);
  if (!data) return null;
  return [...data].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function principalToText(value) {
  const unwrapped = unwrapOpt(value);
  if (unwrapped === null || unwrapped === undefined) return null;
  if (typeof unwrapped === 'string') return unwrapped;
  if (typeof unwrapped.toText === 'function') return unwrapped.toText();
  return null;
}

export function principalBlobToText(value) {
  const data = bytes(value);
  if (!data) return null;
  try {
    return Principal.fromUint8Array(data).toText();
  } catch {
    const hex = bytesToHex(data);
    return hex ? `blob:${hex}` : null;
  }
}

function pairEntries(entries) {
  const result = {};
  for (const entry of entries ?? []) {
    if (Array.isArray(entry) && entry.length >= 2) {
      result[String(entry[0])] = Number(entry[1]);
    }
  }
  return result;
}

export function normalizeGps(gps, warnings = []) {
  const unwrapped = unwrapOpt(gps);
  if (!unwrapped) return null;
  const latitude = Number(unwrapped.latitude);
  const longitude = Number(unwrapped.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    warnings.push(topologyWarning(
      TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
      'Registry data center GPS contained non-finite coordinates.',
      { latitude: unwrapped.latitude, longitude: unwrapped.longitude },
    ));
    return null;
  }
  return { latitude, longitude };
}

export function normalizeNodeProvider(provider, warnings = []) {
  const id = principalToText(provider?.id);
  if (typeof id !== 'string' || id.length === 0) {
    warnings.push(topologyWarning(
      TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
      'Governance returned a node provider without a valid principal.',
    ));
    return null;
  }

  return {
    id,
    rewardAccount: bytesToHex(unwrapOpt(provider?.reward_account)?.hash) ?? null,
    raw: null,
  };
}

export function normalizeDataCenter(record, warnings = []) {
  const id = record?.id;
  if (typeof id !== 'string' || id.length === 0) {
    warnings.push(topologyWarning(
      TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
      'Registry returned a data center without a valid ID.',
    ));
    return null;
  }

  return {
    id,
    region: typeof record.region === 'string' && record.region.length > 0 ? record.region : null,
    owner: typeof record.owner === 'string' && record.owner.length > 0 ? record.owner : null,
    gps: normalizeGps(record.gps, warnings),
    raw: null,
  };
}

export function normalizeNodeOperator(record, warnings = []) {
  const id = principalBlobToText(record?.node_operator_principal_id);
  const nodeProviderId = principalBlobToText(record?.node_provider_principal_id);
  const dataCenterId = record?.dc_id;

  if (typeof id !== 'string' || id.length === 0) {
    warnings.push(topologyWarning(
      TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
      'Registry returned a node operator without a valid principal.',
    ));
    return null;
  }
  if (typeof nodeProviderId !== 'string' || nodeProviderId.length === 0) {
    warnings.push(topologyWarning(
      TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
      'Registry returned a node operator without a valid node provider principal.',
      { nodeOperatorId: id },
    ));
    return null;
  }
  if (typeof dataCenterId !== 'string' || dataCenterId.length === 0) {
    warnings.push(topologyWarning(
      TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
      'Registry returned a node operator without a valid data center ID.',
      { nodeOperatorId: id },
    ));
    return null;
  }

  let nodeAllowance;
  try {
    nodeAllowance = BigInt(record?.node_allowance ?? 0n);
  } catch {
    warnings.push(topologyWarning(
      TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
      'Registry returned a node operator with an invalid node allowance.',
      { nodeOperatorId: id, nodeAllowance: record?.node_allowance },
    ));
    return null;
  }

  return {
    id,
    nodeProviderId,
    dataCenterId,
    nodeAllowance,
    rewardableNodes: pairEntries(record?.rewardable_nodes),
    maxRewardableNodes: pairEntries(record?.max_rewardable_nodes),
    ipv6: typeof unwrapOpt(record?.ipv6) === 'string' ? unwrapOpt(record?.ipv6) : null,
    raw: null,
  };
}

function topologySkeleton({ fetchedAt = new Date().toISOString(), warnings = [] } = {}) {
  return {
    fetchedAt,
    registryVersion: null,
    nodeProvidersById: {},
    nodeOperatorsById: {},
    dataCentersById: {},
    subnets: [],
    nodesById: {},
    warnings,
  };
}

export function normalizeNodeProviderListResponse(response) {
  const warnings = [];
  const nodeProvidersById = {};
  for (const provider of response?.node_providers ?? []) {
    const normalized = normalizeNodeProvider(provider, warnings);
    if (normalized) nodeProvidersById[normalized.id] = normalized;
  }
  return { nodeProvidersById, warnings };
}

function operatorDataCenterPair(value) {
  if (Array.isArray(value)) {
    return { dataCenter: value[0], nodeOperator: value[1] };
  }
  return {
    dataCenter: value?.data_center ?? value?.DataCenterRecord ?? value?._0_ ?? value?.[0],
    nodeOperator: value?.node_operator ?? value?.NodeOperatorRecord ?? value?._1_ ?? value?.[1],
  };
}

export function mergeProviderRegistryResponse(topology, response, providerId) {
  if (response?.Err !== undefined) {
    topology.warnings.push(topologyWarning(
      TOPOLOGY_ERROR_CODES.REGISTRY_RESPONSE_ERR,
      'Registry returned an error for a node provider topology query.',
      { providerId, error: response.Err },
    ));
    return false;
  }

  const entries = response?.Ok;
  if (!Array.isArray(entries)) {
    topology.warnings.push(topologyWarning(
      TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
      'Registry returned an unexpected node provider topology response.',
      { providerId },
    ));
    return false;
  }

  for (const entry of entries) {
    const { dataCenter, nodeOperator } = operatorDataCenterPair(entry);
    const normalizedDataCenter = normalizeDataCenter(dataCenter, topology.warnings);
    const normalizedNodeOperator = normalizeNodeOperator(nodeOperator, topology.warnings);
    if (normalizedDataCenter) {
      topology.dataCentersById[normalizedDataCenter.id] = normalizedDataCenter;
    }
    if (normalizedNodeOperator) {
      topology.nodeOperatorsById[normalizedNodeOperator.id] = normalizedNodeOperator;
      if (normalizedNodeOperator.nodeProviderId !== providerId) {
        topology.warnings.push(topologyWarning(
          TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
          'Registry node operator provider did not match the queried node provider.',
          {
            queriedProviderId: providerId,
            nodeOperatorId: normalizedNodeOperator.id,
            nodeOperatorProviderId: normalizedNodeOperator.nodeProviderId,
          },
        ));
      }
    }
  }
  return true;
}

export function createEmptyTopology(options = {}) {
  return topologySkeleton(options);
}
