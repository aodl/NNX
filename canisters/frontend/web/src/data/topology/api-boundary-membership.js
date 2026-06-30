import {
  Certificate,
  LookupPathStatus,
  lookupResultToBuffer,
} from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { TOPOLOGY_ERROR_CODES, topologyWarning } from './topology-errors.js';

export const NNS_SUBNET_ID = 'tdb26-jop6k-aogll-7ltgs-eruif-6kk7m-qpktf-gdiqx-mxtrf-vb5e6-eqe';

const ENCODER = new TextEncoder();
const API_BOUNDARY_ROOT = ENCODER.encode('api_boundary_nodes');
const DOMAIN_FIELD = ENCODER.encode('domain');
const IPV4_FIELD = ENCODER.encode('ipv4_address');
const IPV6_FIELD = ENCODER.encode('ipv6_address');

function uniquePrincipalNodeIds(nodeIds = [], warnings = []) {
  const valid = [];
  const seen = new Set();
  for (const nodeId of nodeIds) {
    if (typeof nodeId !== 'string' || nodeId.length === 0 || seen.has(nodeId)) continue;
    try {
      Principal.fromText(nodeId);
      valid.push(nodeId);
      seen.add(nodeId);
    } catch (error) {
      warnings.push(topologyWarning(
        TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
        'API boundary membership reads require valid node principal text.',
        { nodeId, message: error?.message ?? String(error) },
      ));
    }
  }
  return valid;
}

function boundaryPath(nodeId, field) {
  return [
    API_BOUNDARY_ROOT,
    Principal.fromText(nodeId).toUint8Array(),
    field,
  ];
}

function lookupPath(certificate, path, nodeId, fieldName, warnings) {
  const result = certificate.lookup_path(path);
  if (result.status === LookupPathStatus.Found) {
    return { found: true, value: lookupResultToBuffer(result) ?? new Uint8Array(), unavailable: false };
  }
  if (result.status !== LookupPathStatus.Absent) {
    warnings.push(topologyWarning(
      TOPOLOGY_ERROR_CODES.PARTIAL_TOPOLOGY,
      'Certified API boundary membership path was not fully known.',
      { nodeId, field: fieldName, status: result.status },
    ));
    return { found: false, value: null, unavailable: true };
  }
  return { found: false, value: null, unavailable: false };
}

function result({ apiBoundaryNodeIds = [], available, warnings = [], errors = [] }) {
  return {
    available,
    nodeIds: apiBoundaryNodeIds,
    apiBoundaryNodeIds,
    errors,
    warnings,
  };
}

export async function readApiBoundaryMembership({
  agent,
  nodeIds = [],
  subnetId = NNS_SUBNET_ID,
  createCertificate = Certificate.create,
} = {}) {
  const warnings = [];
  const validNodeIds = uniquePrincipalNodeIds(nodeIds, warnings);
  if (validNodeIds.length === 0) {
    return result({ apiBoundaryNodeIds: [], available: true, warnings });
  }
  if (!agent?.readSubnetState || !agent.rootKey) {
    return result({
      apiBoundaryNodeIds: [],
      available: false,
      warnings: [topologyWarning(
        TOPOLOGY_ERROR_CODES.RAW_REGISTRY_UNAVAILABLE,
        'Certified API boundary membership reads require an agent with readSubnetState and a root key.',
      ), ...warnings],
    });
  }

  const subnetPrincipal = Principal.fromText(subnetId);
  const pathsByNode = new Map(validNodeIds.map((nodeId) => [nodeId, {
    domain: boundaryPath(nodeId, DOMAIN_FIELD),
    ipv4: boundaryPath(nodeId, IPV4_FIELD),
    ipv6: boundaryPath(nodeId, IPV6_FIELD),
  }]));
  const paths = [...pathsByNode.values()]
    .flatMap((entry) => [entry.domain, entry.ipv4, entry.ipv6]);

  let response;
  try {
    response = await agent.readSubnetState(subnetPrincipal, { paths });
  } catch (error) {
    return result({
      apiBoundaryNodeIds: [],
      available: false,
      warnings: [topologyWarning(
        TOPOLOGY_ERROR_CODES.REGISTRY_CALL_FAILED,
        'Failed to read certified API boundary membership state.',
        { message: error?.message ?? String(error) },
      ), ...warnings],
    });
  }

  let certificate;
  try {
    certificate = await createCertificate({
      certificate: response.certificate,
      rootKey: agent.rootKey,
      principal: { subnetId: subnetPrincipal },
      agent,
    });
  } catch (error) {
    return result({
      apiBoundaryNodeIds: [],
      available: false,
      warnings: [topologyWarning(
        TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
        'Failed to verify certified API boundary membership state.',
        { message: error?.message ?? String(error) },
      ), ...warnings],
    });
  }

  const apiBoundaryNodeIds = [];
  let unavailable = false;
  for (const [nodeId, nodePaths] of pathsByNode.entries()) {
    const domain = lookupPath(certificate, nodePaths.domain, nodeId, 'domain', warnings);
    const ipv4 = lookupPath(certificate, nodePaths.ipv4, nodeId, 'ipv4_address', warnings);
    const ipv6 = lookupPath(certificate, nodePaths.ipv6, nodeId, 'ipv6_address', warnings);
    if (domain.unavailable || ipv4.unavailable || ipv6.unavailable) unavailable = true;
    if (domain.found || ipv4.found || ipv6.found) apiBoundaryNodeIds.push(nodeId);
  }

  if (unavailable) {
    return result({
      apiBoundaryNodeIds: [],
      available: false,
      warnings,
    });
  }

  return result({
    apiBoundaryNodeIds,
    available: true,
    warnings,
  });
}
