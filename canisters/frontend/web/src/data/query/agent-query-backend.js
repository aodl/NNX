import { HttpAgent } from '@icp-sdk/core/agent';
import { safeGetCanisterEnv } from '@icp-sdk/core/agent/canister-env';
import { createActor as createCmcActor } from '../../../declarations/nns_cmc/index.js';
import { createActor as createGovernanceActor } from '../../../declarations/nns_governance/index.js';
import { createActor as createRegistryActor } from '../../../declarations/nns_registry/index.js';
import {
  NNS_CMC_CANISTER_ID,
  NNS_GOVERNANCE_CANISTER_ID,
  NNS_REGISTRY_CANISTER_ID,
} from '../../app/config.js';
import { createRawRegistryClient } from '../topology/raw-registry-client.js';
import { createTopologyService } from '../topology/topology-service.js';
import { IcTopologyError, TOPOLOGY_ERROR_CODES } from '../topology/topology-errors.js';
import {
  createNodeMetricsProxyActor,
  createNodeMetricsProxyClient,
} from '../node-health-metrics/node-metrics-proxy-client.js';
import { readApiBoundaryMembership } from '../topology/api-boundary-membership.js';
import {
  normalizeCmcDefaultSubnetsResponse,
  normalizeCmcSubnetLabelsResponse,
  normalizeKnownNeuronNamesResponse,
  normalizeNeuronListResponse,
  normalizeOpenProposalListResponse,
  normalizeProposalInfo,
} from './query-normalizers.js';

const KNOWN_NEURON_CACHE_MS = 60 * 60 * 1000;
const PROPOSAL_REWARD_STATUS_ACCEPT_VOTES = 1;
const PROPOSAL_PAGE_LIMIT = 100;
const NODE_METRICS_PROXY_ENV = 'PUBLIC_CANISTER_ID:nnx_node_metrics_proxy';

function canisterEnvValue(name) {
  const sdkEnv = safeGetCanisterEnv?.() ?? null;
  if (sdkEnv?.[name]) return sdkEnv[name];
  const cookie = globalThis.document?.cookie
    ?.split(';')
    .find((item) => item.trim().startsWith('ic_env='));
  if (!cookie) return null;
  const value = decodeURIComponent(cookie.split('=').slice(1).join('='));
  for (const part of value.split('&')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator) === name) return part.slice(separator + 1);
  }
  return null;
}

async function generatedFrontendEnvValue(name) {
  try {
    const response = await fetch('/generated/frontend-env.json', { cache: 'no-store' });
    if (!response.ok) return null;
    const env = await response.json();
    return typeof env?.[name] === 'string' && env[name] ? env[name] : null;
  } catch {
    return null;
  }
}

export function listAcceptingVotesProposalsRequest(beforeProposalId = null) {
  return {
    include_reward_status: [PROPOSAL_REWARD_STATUS_ACCEPT_VOTES],
    omit_large_fields: [false],
    before_proposal: beforeProposalId === null ? [] : [{ id: beforeProposalId }],
    limit: PROPOSAL_PAGE_LIMIT,
    exclude_topic: [],
    include_all_manage_neuron_proposals: [],
    include_status: [],
    return_self_describing_action: [true],
  };
}

function proposalInfoId(proposalInfo) {
  const idOpt = proposalInfo?.id;
  const id = Array.isArray(idOpt) ? idOpt[0]?.id : idOpt?.id;
  return id === null || id === undefined ? null : BigInt(id);
}

export async function listAcceptingVotesProposalInfos({ governance }) {
  const proposals = [];
  const seenProposalIds = new Set();
  let beforeProposalId = null;

  while (true) {
    const response = await governance.list_proposals(
      listAcceptingVotesProposalsRequest(beforeProposalId),
    );
    const page = response?.proposal_info ?? [];
    if (page.length === 0) break;

    let nextBeforeProposalId = null;
    for (const proposalInfo of page) {
      const id = proposalInfoId(proposalInfo);
      if (id === null) continue;
      nextBeforeProposalId = id;
      const key = id.toString();
      if (!seenProposalIds.has(key)) {
        seenProposalIds.add(key);
        proposals.push(proposalInfo);
      }
    }

    if (page.length < PROPOSAL_PAGE_LIMIT || nextBeforeProposalId === null) break;
    if (beforeProposalId !== null && nextBeforeProposalId === beforeProposalId) break;
    beforeProposalId = nextBeforeProposalId;
  }

  return proposals;
}

export async function createAgentQueryBackend({
  host,
  local,
  cmcCanisterId = NNS_CMC_CANISTER_ID,
  governanceCanisterId = NNS_GOVERNANCE_CANISTER_ID,
  registryCanisterId = NNS_REGISTRY_CANISTER_ID,
  nodeMetricsProxyCanisterId = null,
} = {}) {
  let agent;
  try {
    agent = await HttpAgent.create({
      host,
      verifyQuerySignatures: true,
    });

    if (local) {
      await agent.fetchRootKey();
    }
  } catch (error) {
    throw new IcTopologyError(
      TOPOLOGY_ERROR_CODES.AGENT_INIT_FAILED,
      'Failed to initialize the IC query agent.',
      error,
    );
  }

  let governance;
  let registry;
  let cmc;
  try {
    governance = createGovernanceActor(governanceCanisterId, { agent });
    registry = createRegistryActor(registryCanisterId, { agent });
    cmc = createCmcActor(cmcCanisterId, { agent });
  } catch (error) {
    throw new IcTopologyError(
      TOPOLOGY_ERROR_CODES.ACTOR_INIT_FAILED,
      'Failed to initialize NNS query actors.',
      error,
    );
  }

  const rawRegistryClient = createRawRegistryClient({ agent, registryCanisterId });
  const topologyService = createTopologyService({ governance, registry, rawRegistryClient });
  const resolvedNodeMetricsProxyCanisterId = nodeMetricsProxyCanisterId
    ?? canisterEnvValue(NODE_METRICS_PROXY_ENV)
    ?? await generatedFrontendEnvValue(NODE_METRICS_PROXY_ENV)
    ?? null;
  const nodeMetricsProxyClient = createNodeMetricsProxyClient({
    actor: resolvedNodeMetricsProxyCanisterId
      ? createNodeMetricsProxyActor({ agent, canisterId: resolvedNodeMetricsProxyCanisterId })
      : null,
  });
  let knownNeuronNames = new Map();
  let knownNeuronFetchedAt = 0;
  let knownNeuronRefresh = null;

  async function getKnownNeuronNames() {
    const now = Date.now();
    if (knownNeuronNames.size > 0 && now - knownNeuronFetchedAt < KNOWN_NEURON_CACHE_MS) {
      return knownNeuronNames;
    }

    knownNeuronRefresh ??= governance.list_known_neurons()
      .then((response) => {
        knownNeuronNames = normalizeKnownNeuronNamesResponse(response);
        knownNeuronFetchedAt = Date.now();
        return knownNeuronNames;
      })
      .catch(() => knownNeuronNames)
      .finally(() => {
        knownNeuronRefresh = null;
      });

    return knownNeuronRefresh;
  }

  async function getNnsNeurons({ neuronIds }) {
    const [response, names] = await Promise.all([
      governance.list_neurons({
        neuron_ids: neuronIds,
        include_neurons_readable_by_caller: false,
        include_empty_neurons_readable_by_caller: [],
        include_public_neurons_in_full_neurons: [true],
        page_number: [],
        page_size: [],
        neuron_subaccounts: [],
      }),
      getKnownNeuronNames(),
    ]);

    return normalizeNeuronListResponse(response, neuronIds, names);
  }

  async function getNnsNeuron({ neuronId }) {
    const results = await getNnsNeurons({ neuronIds: [neuronId] });
    return results[0] ?? { id: neuronId, exists: false };
  }

  async function getOpenNnsProposals() {
    const [response, names] = await Promise.all([
      listAcceptingVotesProposalInfos({ governance }),
      getKnownNeuronNames(),
    ]);
    return normalizeOpenProposalListResponse(response, names);
  }

  async function getNnsProposal({ proposalId }) {
    const [response, names] = await Promise.all([
      governance.get_proposal_info(proposalId),
      getKnownNeuronNames(),
    ]);
    const proposalInfo = Array.isArray(response) ? (response[0] ?? null) : response ?? null;
    return proposalInfo ? normalizeProposalInfo(proposalInfo, names) : null;
  }

  async function getCmcSubnetLabels() {
    let typedResponse;
    let defaultResponse;
    try {
      [typedResponse, defaultResponse] = await Promise.all([
        cmc.get_subnet_types_to_subnets(),
        cmc.get_default_subnets(),
      ]);
    } catch (error) {
      throw new IcTopologyError(
        TOPOLOGY_ERROR_CODES.REGISTRY_CALL_FAILED,
        'Failed to read CMC subnet placement assignments.',
        error,
      );
    }

    const labelResult = normalizeCmcSubnetLabelsResponse(typedResponse);
    const defaultResult = normalizeCmcDefaultSubnetsResponse(defaultResponse);
    const publicSubnetIds = [
      ...new Set([
        ...defaultResult.defaultSubnetIds,
        ...Object.keys(labelResult.labelsBySubnetId),
      ]),
    ];

    return {
      labelsBySubnetId: labelResult.labelsBySubnetId,
      defaultSubnetIds: defaultResult.defaultSubnetIds,
      publicSubnetIds,
      warnings: [...labelResult.warnings, ...defaultResult.warnings],
    };
  }

  async function getApiBoundaryNodeIds({ nodeIds } = {}) {
    return readApiBoundaryMembership({ agent, nodeIds });
  }

  return Object.freeze({
    getNnsNeuron,
    getNnsNeurons,
    getOpenNnsProposals,
    getNnsProposal,
    getIcNodeProviders: topologyService.getIcNodeProviders,
    getIcSubnet: topologyService.getIcSubnet,
    getIcSubnetDetails: topologyService.getIcSubnetDetails,
    getIcNodeDetails: topologyService.getIcNodeDetails,
    getIcSubnets: topologyService.getIcSubnets,
    getIcSubnetNodeCounts: topologyService.getIcSubnetNodeCounts,
    getIcTopology: topologyService.getIcTopology,
    getNodeMetricsHistory: nodeMetricsProxyClient.getNodeMetricsHistory,
    getApiBoundaryNodeIds,
    getCmcSubnetLabels,
    refreshIcTopology: topologyService.refreshIcTopology,
    clearTopologyCache: topologyService.clearTopologyCache,
  });
}
