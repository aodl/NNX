import { HttpAgent } from '@icp-sdk/core/agent';
import { createActor as createGovernanceActor } from '../../../declarations/nns_governance/index.js';
import { createActor as createRegistryActor } from '../../../declarations/nns_registry/index.js';
import {
  NNS_GOVERNANCE_CANISTER_ID,
  NNS_REGISTRY_CANISTER_ID,
} from '../../app/config.js';
import { createTopologyService } from '../topology/topology-service.js';
import { IcTopologyError, TOPOLOGY_ERROR_CODES } from '../topology/topology-errors.js';
import {
  normalizeKnownNeuronNamesResponse,
  normalizeNeuronListResponse,
  normalizeOpenProposalListResponse,
} from './query-normalizers.js';

const KNOWN_NEURON_CACHE_MS = 60 * 60 * 1000;

export function getPendingProposalsRequestOpt() {
  return [{ return_self_describing_action: [false] }];
}

export async function createAgentQueryBackend({
  host,
  local,
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
  try {
    governance = createGovernanceActor(governanceCanisterId, { agent });
    registry = createRegistryActor(registryCanisterId, { agent });
  } catch (error) {
    throw new IcTopologyError(
      TOPOLOGY_ERROR_CODES.ACTOR_INIT_FAILED,
      'Failed to initialize NNS query actors.',
      error,
    );
  }

  const topologyService = createTopologyService({ governance, registry });
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

  return Object.freeze({
    getNnsNeuron,
    getNnsNeurons,
    getOpenNnsProposals,
    getNnsProposal,
    getIcNodeProviders: topologyService.getIcNodeProviders,
    getIcTopology: topologyService.getIcTopology,
    refreshIcTopology: topologyService.refreshIcTopology,
    clearTopologyCache: topologyService.clearTopologyCache,
  });
}
