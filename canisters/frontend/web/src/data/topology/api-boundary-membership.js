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
    return lookupResultToBuffer(result) ?? new Uint8Array();
  }
  if (result.status !== LookupPathStatus.Absent) {
    warnings.push(topologyWarning(
      TOPOLOGY_ERROR_CODES.PARTIAL_TOPOLOGY,
      'Certified API boundary membership path was not fully known.',
      { nodeId, field: fieldName, status: result.status },
    ));
  }
  return null;
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
    return { apiBoundaryNodeIds: [], available: true, warnings };
  }
  if (!agent?.readSubnetState || !agent.rootKey) {
    return {
      apiBoundaryNodeIds: [],
      available: false,
      warnings: [topologyWarning(
        TOPOLOGY_ERROR_CODES.RAW_REGISTRY_UNAVAILABLE,
        'Certified API boundary membership reads require an agent with readSubnetState and a root key.',
      ), ...warnings],
    };
  }

  const subnetPrincipal = Principal.fromText(subnetId);
  const pathsByNode = new Map(validNodeIds.map((nodeId) => [nodeId, {
    domain: boundaryPath(nodeId, DOMAIN_FIELD),
    ipv4: boundaryPath(nodeId, IPV4_FIELD),
  }]));
  const paths = [...pathsByNode.values()].flatMap((entry) => [entry.domain, entry.ipv4]);

  let response;
  try {
    response = await agent.readSubnetState(subnetPrincipal, { paths });
  } catch (error) {
    return {
      apiBoundaryNodeIds: [],
      available: false,
      warnings: [topologyWarning(
        TOPOLOGY_ERROR_CODES.REGISTRY_CALL_FAILED,
        'Failed to read certified API boundary membership state.',
        { message: error?.message ?? String(error) },
      ), ...warnings],
    };
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
    return {
      apiBoundaryNodeIds: [],
      available: false,
      warnings: [topologyWarning(
        TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
        'Failed to verify certified API boundary membership state.',
        { message: error?.message ?? String(error) },
      ), ...warnings],
    };
  }

  const apiBoundaryNodeIds = [];
  for (const [nodeId, nodePaths] of pathsByNode.entries()) {
    const domain = lookupPath(certificate, nodePaths.domain, nodeId, 'domain', warnings);
    const ipv4 = lookupPath(certificate, nodePaths.ipv4, nodeId, 'ipv4_address', warnings);
    if (domain !== null || ipv4 !== null) apiBoundaryNodeIds.push(nodeId);
  }

  return {
    apiBoundaryNodeIds,
    available: true,
    warnings,
  };
}
