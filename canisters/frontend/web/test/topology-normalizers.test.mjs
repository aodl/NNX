import assert from 'node:assert/strict';
import test from 'node:test';
import { Principal } from '@icp-sdk/core/principal';
import { TOPOLOGY_ERROR_CODES, IcTopologyError } from '../src/data/topology/topology-errors.js';
import {
  normalizeDataCenter,
  normalizeGps,
  normalizeNodeOperator,
  normalizeNodeProvider,
  normalizeSubnet,
  normalizeSubnetType,
} from '../src/data/topology/topology-normalizers.js';
import { createTopologyService, loadIcTopology } from '../src/data/topology/topology-service.js';

const providerPrincipal = Principal.fromText('aaaaa-aa');
const providerId = providerPrincipal.toText();
const operatorPrincipal = Principal.fromText('2vxsx-fae');
const subnetPrincipal = Principal.fromText('uuc56-gyb');
const subnetId = subnetPrincipal.toText();

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

function subnetRecord(overrides = {}) {
  return {
    membership: [principalBlob(operatorPrincipal)],
    replica_version_id: 'replica-1',
    subnet_type: { application: null },
    is_halted: false,
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

test('normalizes subnet type variants to stable strings', () => {
  assert.equal(normalizeSubnetType({ application: null }), 'application');
  assert.equal(normalizeSubnetType({ verified_application: null }), 'verified_application');
  assert.equal(normalizeSubnetType({ system: null }), 'system');
  assert.equal(normalizeSubnetType({ cloud_engine: null }), 'cloud_engine');
  assert.equal(normalizeSubnetType({ future_type: null }), 'unknown');
  assert.equal(normalizeSubnetType(null), 'unknown');
});

test('normalizes subnet membership blobs to principal text node IDs', () => {
  const warnings = [];
  const normalized = normalizeSubnet(subnetRecord(), subnetId, warnings);

  assert.equal(normalized.id, subnetId);
  assert.equal(normalized.type, 'application');
  assert.equal(normalized.replicaVersionId, 'replica-1');
  assert.equal(normalized.isHalted, false);
  assert.deepEqual(normalized.nodeIds, [operatorPrincipal.toText()]);
  assert.deepEqual(normalized.membership, [operatorPrincipal.toText()]);
  assert.equal(normalized.nodeCount, 1);
  assert.equal(normalized.raw, null);
  assert.deepEqual(warnings, []);
});

test('subnet node count equals successfully normalized membership length', () => {
  const otherNode = Principal.fromText('aaaaa-aa');
  const warnings = [];
  const normalized = normalizeSubnet(
    subnetRecord({ membership: [principalBlob(operatorPrincipal), principalBlob(otherNode)] }),
    subnetId,
    warnings,
  );

  assert.deepEqual(normalized.nodeIds, [operatorPrincipal.toText(), otherNode.toText()]);
  assert.equal(normalized.nodeCount, 2);
  assert.deepEqual(warnings, []);
});

test('malformed subnet membership creates a validation warning and is omitted', () => {
  const warnings = [];
  const normalized = normalizeSubnet(
    subnetRecord({ membership: [principalBlob(operatorPrincipal), 'not-a-principal-blob'] }),
    subnetId,
    warnings,
  );

  assert.deepEqual(normalized.nodeIds, [operatorPrincipal.toText()]);
  assert.equal(normalized.nodeCount, 1);
  assert.equal(warnings[0].code, TOPOLOGY_ERROR_CODES.VALIDATION_FAILED);
  assert.equal(warnings[0].details.subnetId, subnetId);
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

test('getIcSubnet normalizes Registry Ok subnet responses', async () => {
  const service = createTopologyService({
    governance: {},
    registry: {
      get_subnet: async (request) => {
        assert.equal(request.subnet_id[0].toText(), subnetId);
        return { Ok: subnetRecord({ subnet_type: { system: null }, is_halted: true }) };
      },
    },
  });

  const subnet = await service.getIcSubnet({ subnetId });

  assert.equal(subnet.id, subnetId);
  assert.equal(subnet.type, 'system');
  assert.equal(subnet.isHalted, true);
  assert.equal(subnet.nodeCount, 1);
});

test('getIcSubnet returns null for Registry Err subnet responses', async () => {
  const service = createTopologyService({
    governance: {},
    registry: {
      get_subnet: async () => ({ Err: 'missing subnet' }),
    },
  });

  assert.equal(await service.getIcSubnet({ subnetId }), null);
});

test('getIcSubnets reads known subnet IDs with concurrency limiting', async () => {
  let active = 0;
  let maxActive = 0;
  const subnetIds = [
    Principal.fromText('uuc56-gyb').toText(),
    Principal.fromText('aaaaa-aa').toText(),
    Principal.fromText('2vxsx-fae').toText(),
  ];
  const service = createTopologyService({
    governance: {},
    registry: {
      get_subnet: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { Ok: subnetRecord() };
      },
    },
    maxConcurrency: 2,
  });

  const { subnets, warnings } = await service.getIcSubnets({ subnetIds });

  assert.equal(subnets.length, 3);
  assert.equal(maxActive, 2);
  assert.deepEqual(warnings, []);
});

test('getIcSubnets with no IDs throws RAW_REGISTRY_UNAVAILABLE without a raw client', async () => {
  const service = createTopologyService({
    governance: {},
    registry: { get_subnet: async () => ({ Ok: subnetRecord() }) },
  });

  await assert.rejects(
    () => service.getIcSubnets(),
    (error) => {
      assert.equal(error instanceof IcTopologyError, true);
      assert.equal(error.code, TOPOLOGY_ERROR_CODES.RAW_REGISTRY_UNAVAILABLE);
      return true;
    },
  );
});

test('getIcSubnets with no IDs discovers subnet IDs through raw Registry client', async () => {
  const service = createTopologyService({
    governance: {},
    registry: {
      get_subnet: async (request) => {
        assert.equal(request.subnet_id[0].toText(), subnetId);
        return { Ok: subnetRecord() };
      },
    },
    rawRegistryClient: {
      listSubnetIds: async () => [subnetId],
    },
  });

  const { subnets, warnings } = await service.getIcSubnets();

  assert.equal(subnets.length, 1);
  assert.equal(subnets[0].id, subnetId);
  assert.deepEqual(warnings, []);
});

test('getIcSubnets returns warnings for Registry Err subnet responses', async () => {
  const service = createTopologyService({
    governance: {},
    registry: {
      get_subnet: async () => ({ Err: 'missing subnet' }),
    },
  });

  const { subnets, warnings } = await service.getIcSubnets({ subnetIds: [subnetId] });

  assert.deepEqual(subnets, []);
  assert.equal(warnings[0].code, TOPOLOGY_ERROR_CODES.REGISTRY_RESPONSE_ERR);
});

test('getIcSubnetNodeCounts returns counts by subnet ID', async () => {
  const service = createTopologyService({
    governance: {},
    registry: {
      get_subnet: async () => ({ Ok: subnetRecord({ replica_version_id: 'replica-2' }) }),
    },
  });

  const { countsBySubnetId, warnings } = await service.getIcSubnetNodeCounts({ subnetIds: [subnetId] });

  assert.deepEqual(countsBySubnetId[subnetId], {
    subnetId,
    nodeCount: 1,
    nodeIds: [operatorPrincipal.toText()],
    type: 'application',
    replicaVersionId: 'replica-2',
    isHalted: false,
  });
  assert.deepEqual(warnings, []);
});

test('getIcTopology attaches known subnet records without full subnet discovery', async () => {
  const service = createTopologyService({
    governance: {
      list_node_providers: async () => ({ node_providers: [provider()] }),
    },
    registry: {
      get_node_operators_and_dcs_of_node_provider: async () => ({ Ok: [[dataCenter(), nodeOperator()]] }),
      get_subnet: async () => ({ Ok: subnetRecord() }),
    },
  });

  const topology = await service.getIcTopology({ subnetIds: [subnetId] });

  assert.equal(topology.subnets.length, 1);
  assert.equal(topology.subnets[0].id, subnetId);
  assert.equal(topology.subnets[0].nodeCount, 1);
});

test('getIcSubnetDetails joins subnet nodes to data center GPS', async () => {
  const service = createTopologyService({
    governance: {
      list_node_providers: async () => ({ node_providers: [provider()] }),
    },
    registry: {
      get_node_operators_and_dcs_of_node_provider: async () => ({ Ok: [[dataCenter(), nodeOperator()]] }),
      get_subnet: async () => ({ Ok: subnetRecord() }),
    },
    rawRegistryClient: {
      getNodeRecord: async (nodeId) => ({
        nodeId,
        nodeOperatorId: operatorPrincipal.toText(),
      }),
    },
  });

  const detail = await service.getIcSubnetDetails({ subnetId });

  assert.equal(detail.subnet.id, subnetId);
  assert.deepEqual(detail.nodeLocations, [{
    nodeId: operatorPrincipal.toText(),
    nodeOperatorId: operatorPrincipal.toText(),
    nodeProviderId: providerId,
    dataCenterId: 'dc-1',
    dataCenterRegion: 'Europe',
    dataCenterOwner: 'Node Provider Ltd',
    gps: { latitude: 52.52, longitude: 13.405 },
  }]);
  assert.deepEqual(detail.warnings, []);
});

test('getIcNodeDetails joins arbitrary Registry node records to data center GPS', async () => {
  const service = createTopologyService({
    governance: {
      list_node_providers: async () => ({ node_providers: [provider()] }),
    },
    registry: {
      get_node_operators_and_dcs_of_node_provider: async () => ({ Ok: [[dataCenter(), nodeOperator()]] }),
    },
    rawRegistryClient: {
      getNodeRecord: async (nodeId) => ({
        nodeId,
        nodeOperatorId: operatorPrincipal.toText(),
      }),
    },
  });

  const detail = await service.getIcNodeDetails({ nodeIds: [operatorPrincipal.toText()] });

  assert.deepEqual(detail.nodeLocations, [{
    nodeId: operatorPrincipal.toText(),
    nodeOperatorId: operatorPrincipal.toText(),
    nodeProviderId: providerId,
    dataCenterId: 'dc-1',
    dataCenterRegion: 'Europe',
    dataCenterOwner: 'Node Provider Ltd',
    gps: { latitude: 52.52, longitude: 13.405 },
  }]);
  assert.deepEqual(detail.warnings, []);
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
