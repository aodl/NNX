import assert from 'node:assert/strict';
import test from 'node:test';
import { Principal } from '@icp-sdk/core/principal';
import { TOPOLOGY_ERROR_CODES, IcTopologyError } from '../src/data/topology/topology-errors.js';
import {
  normalizeDataCenter,
  normalizeGps,
  normalizeNodeOperator,
  normalizeNodeProvider,
} from '../src/data/topology/topology-normalizers.js';
import { createTopologyService, loadIcTopology } from '../src/data/topology/topology-service.js';

const providerPrincipal = Principal.fromText('aaaaa-aa');
const providerId = providerPrincipal.toText();
const operatorPrincipal = Principal.fromText('2vxsx-fae');

function principalBlob(principal) {
  return [...principal.toUint8Array()];
}

function provider(id = providerPrincipal) {
  return {
    id: [id],
    reward_account: [{ hash: [0, 1, 2, 255] }],
  };
}

function dataCenter(overrides = {}) {
  return {
    id: 'dc-1',
    region: 'Europe',
    owner: 'Node Provider Ltd',
    gps: [{ latitude: 52.52, longitude: 13.405 }],
    ...overrides,
  };
}

function nodeOperator(overrides = {}) {
  return {
    node_operator_principal_id: principalBlob(operatorPrincipal),
    node_provider_principal_id: principalBlob(providerPrincipal),
    dc_id: 'dc-1',
    node_allowance: 12n,
    rewardable_nodes: [['type1', 2]],
    max_rewardable_nodes: [['type1', 4]],
    ipv6: ['2001:db8::1'],
    ...overrides,
  };
}

test('normalizes node providers to plain objects', () => {
  const warnings = [];
  const normalized = normalizeNodeProvider(provider(), warnings);

  assert.deepEqual(normalized, {
    id: providerId,
    rewardAccount: '000102ff',
    raw: null,
  });
  assert.deepEqual(warnings, []);
});

test('invalid provider IDs produce validation warnings', () => {
  const warnings = [];
  const normalized = normalizeNodeProvider({ id: [], reward_account: [] }, warnings);

  assert.equal(normalized, null);
  assert.equal(warnings[0].code, TOPOLOGY_ERROR_CODES.VALIDATION_FAILED);
});

test('normalizes GPS coordinates', () => {
  const warnings = [];

  assert.deepEqual(
    normalizeGps([{ latitude: 1.5, longitude: -2.25 }], warnings),
    { latitude: 1.5, longitude: -2.25 },
  );
  assert.deepEqual(warnings, []);
});

test('invalid GPS coordinates become warnings', () => {
  const warnings = [];

  assert.equal(normalizeGps([{ latitude: Number.NaN, longitude: 1 }], warnings), null);
  assert.equal(warnings[0].code, TOPOLOGY_ERROR_CODES.VALIDATION_FAILED);
});

test('normalizes data centers', () => {
  const warnings = [];
  const normalized = normalizeDataCenter(dataCenter(), warnings);

  assert.equal(normalized.id, 'dc-1');
  assert.equal(normalized.region, 'Europe');
  assert.equal(normalized.owner, 'Node Provider Ltd');
  assert.deepEqual(normalized.gps, { latitude: 52.52, longitude: 13.405 });
  assert.equal(normalized.raw, null);
  assert.deepEqual(warnings, []);
});

test('normalizes node operators', () => {
  const warnings = [];
  const normalized = normalizeNodeOperator(nodeOperator(), warnings);

  assert.equal(normalized.id, operatorPrincipal.toText());
  assert.equal(normalized.nodeProviderId, providerId);
  assert.equal(normalized.dataCenterId, 'dc-1');
  assert.equal(normalized.nodeAllowance, 12n);
  assert.deepEqual(normalized.rewardableNodes, { type1: 2 });
  assert.deepEqual(normalized.maxRewardableNodes, { type1: 4 });
  assert.equal(normalized.ipv6, '2001:db8::1');
  assert.equal(normalized.raw, null);
  assert.deepEqual(warnings, []);
});

test('invalid node operator allowance produces a warning', () => {
  const warnings = [];
  const normalized = normalizeNodeOperator(nodeOperator({ node_allowance: 'not-a-number' }), warnings);

  assert.equal(normalized, null);
  assert.equal(warnings[0].code, TOPOLOGY_ERROR_CODES.VALIDATION_FAILED);
});

test('topology service returns partial data when one provider call fails', async () => {
  const otherProvider = Principal.fromText('2vxsx-fae');
  const governance = {
    list_node_providers: async () => ({
      node_providers: [provider(providerPrincipal), provider(otherProvider)],
    }),
  };
  const registry = {
    get_node_operators_and_dcs_of_node_provider: async (principal) => {
      if (principal.toText() === otherProvider.toText()) throw new Error('registry unavailable');
      return { Ok: [[dataCenter(), nodeOperator()]] };
    },
  };

  const topology = await loadIcTopology({ governance, registry, maxConcurrency: 2 });

  assert.equal(Object.keys(topology.nodeProvidersById).length, 2);
  assert.equal(Object.keys(topology.nodeOperatorsById).length, 1);
  assert.ok(topology.warnings.some((warning) => warning.code === TOPOLOGY_ERROR_CODES.REGISTRY_CALL_FAILED));
  assert.ok(topology.warnings.some((warning) => warning.code === TOPOLOGY_ERROR_CODES.PARTIAL_TOPOLOGY));
});

test('topology service converts Registry Err responses into warnings', async () => {
  const governance = {
    list_node_providers: async () => ({ node_providers: [provider()] }),
  };
  const registry = {
    get_node_operators_and_dcs_of_node_provider: async () => ({ Err: 'missing provider data' }),
  };

  await assert.rejects(
    () => loadIcTopology({ governance, registry }),
    (error) => {
      assert.equal(error instanceof IcTopologyError, true);
      assert.equal(error.code, TOPOLOGY_ERROR_CODES.REGISTRY_CALL_FAILED);
      return true;
    },
  );
});

test('topology service does not require subnet discovery in Candid-safe mode', async () => {
  const governance = {
    list_node_providers: async () => ({ node_providers: [provider()] }),
  };
  const registry = {
    get_node_operators_and_dcs_of_node_provider: async () => ({ Ok: [[dataCenter(), nodeOperator()]] }),
  };

  const topology = await loadIcTopology({ governance, registry });

  assert.deepEqual(topology.subnets, []);
  assert.deepEqual(topology.nodesById, {});
});

test('getIcNodeProviders does not require Registry topology reads', async () => {
  const service = createTopologyService({
    governance: {
      list_node_providers: async () => ({ node_providers: [provider()] }),
    },
    registry: {
      get_node_operators_and_dcs_of_node_provider: async () => {
        throw new Error('should not be called');
      },
    },
  });

  const providers = await service.getIcNodeProviders();

  assert.deepEqual(providers, [{
    id: providerId,
    rewardAccount: '000102ff',
    raw: null,
  }]);
});
