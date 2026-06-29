import { HttpAgent } from '@icp-sdk/core/agent';
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
  normalizeCmcDefaultSubnetsResponse,
  normalizeCmcSubnetLabelsResponse,
  normalizeKnownNeuronNamesResponse,
  normalizeNeuronListResponse,
  normalizeOpenProposalListResponse,
} from './query-normalizers.js';

const KNOWN_NEURON_CACHE_MS = 60 * 60 * 1000;

export function getPendingProposalsRequestOpt() {
  return [{ return_self_describing_action: [true] }];
}

export async function createAgentQueryBackend({
  host,
  local,
  cmcCanisterId = NNS_CMC_CANISTER_ID,
  governanceCanisterId = NNS_GOVERNANCE_CANISTER_ID,
  registryCanisterId = NNS_REGISTRY_CANISTER_ID,
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
      governance.get_pending_proposals(getPendingProposalsRequestOpt()),
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
    return proposalInfo ? normalizeOpenProposalListResponse([proposalInfo], names)[0] : null;
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
    getCmcSubnetLabels,
    refreshIcTopology: topologyService.refreshIcTopology,
    clearTopologyCache: topologyService.clearTopologyCache,
  });
}
