import assert from 'node:assert/strict';
import test from 'node:test';
import { Principal } from '@icp-sdk/core/principal';
import { TOPOLOGY_ERROR_CODES, IcTopologyError } from '../src/data/topology/topology-errors.js';
import {
  createRawRegistryClient,
  decodeNodeRecord,
  decodeRegistryGetValueResponse,
  decodeSubnetListRecord,
} from '../src/data/topology/raw-registry-client.js';

function concatBytes(chunks) {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function varint(value) {
  let remaining = BigInt(value);
  const out = [];
  while (remaining >= 0x80n) {
    out.push(Number((remaining & 0x7fn) | 0x80n));
    remaining >>= 7n;
  }
  out.push(Number(remaining));
  return Uint8Array.from(out);
}

function bytesField(fieldNumber, value) {
  return concatBytes([
    varint((fieldNumber << 3) | 2),
    varint(value.length),
    value,
  ]);
}

function varintField(fieldNumber, value) {
  return concatBytes([varint(fieldNumber << 3), varint(value)]);
}

function subnetListFixture(subnetIds) {
  return concatBytes(subnetIds.map((id) => bytesField(2, Principal.fromText(id).toUint8Array())));
}

function nodeRecordFixture(nodeOperatorId) {
  return concatBytes([
    bytesField(15, Principal.fromText(nodeOperatorId).toUint8Array()),
    bytesField(18, concatBytes([
      bytesField(1, new TextEncoder().encode('203.0.113.10')),
      bytesField(2, new TextEncoder().encode('203.0.113.1')),
      varintField(3, 24),
    ])),
    bytesField(19, new TextEncoder().encode('node.example.com')),
  ]);
}

function getValueResponseFixture(value, version = 7) {
  return concatBytes([
    varintField(2, version),
    bytesField(3, value),
  ]);
}

function largeValueResponseFixture() {
  return concatBytes([
    varintField(2, 7),
    bytesField(4, new TextEncoder().encode('chunk-key-1')),
  ]);
}

test('decodes raw Registry subnet_list protobuf fixture', () => {
  const subnetIds = [
    Principal.fromText('uuc56-gyb').toText(),
    Principal.fromText('2vxsx-fae').toText(),
  ];

  assert.deepEqual(decodeSubnetListRecord(subnetListFixture(subnetIds)), subnetIds);
});

test('decodes raw Registry get_value protobuf fixture', () => {
  const subnetIds = [Principal.fromText('uuc56-gyb').toText()];
  const subnetList = subnetListFixture(subnetIds);
  const response = decodeRegistryGetValueResponse(getValueResponseFixture(subnetList));

  assert.equal(response.version, 7n);
  assert.deepEqual(decodeSubnetListRecord(response.value), subnetIds);
  assert.equal(response.error, null);
});

test('decodes raw Registry get_value with future unknown protobuf fields', () => {
  const subnetIds = [Principal.fromText('uuc56-gyb').toText()];
  const response = decodeRegistryGetValueResponse(concatBytes([
    getValueResponseFixture(subnetListFixture(subnetIds)),
    bytesField(99, new TextEncoder().encode('future field')),
  ]));

  assert.equal(response.version, 7n);
  assert.deepEqual(decodeSubnetListRecord(response.value), subnetIds);
});

test('decodes raw Registry node record protobuf fixture', () => {
  const nodeOperatorId = Principal.fromText('uuc56-gyb').toText();

  assert.deepEqual(decodeNodeRecord(nodeRecordFixture(nodeOperatorId)), {
    nodeOperatorId,
    publicIpv4: {
      ipAddr: '203.0.113.10',
      gatewayIpAddr: ['203.0.113.1'],
      prefixLength: 24,
    },
    domain: 'node.example.com',
    httpEndpoint: null,
    xnetEndpoint: null,
    hostosVersionId: null,
    rewardType: null,
  });
});

test('raw Registry client calls get_value and returns subnet IDs', async () => {
  const subnetIds = [Principal.fromText('uuc56-gyb').toText()];
  let queryCall = null;
  const client = createRawRegistryClient({
    registryCanisterId: 'rwlgt-iiaaa-aaaaa-aaaaa-cai',
    agent: {
      query: async (canisterId, fields) => {
        queryCall = { canisterId, fields };
        return {
          status: 'replied',
          reply: {
            arg: getValueResponseFixture(subnetListFixture(subnetIds)),
          },
        };
      },
    },
  });

  assert.deepEqual(await client.listSubnetIds(), subnetIds);
  assert.equal(queryCall.canisterId, 'rwlgt-iiaaa-aaaaa-aaaaa-cai');
  assert.equal(queryCall.fields.methodName, 'get_value');
  assert.ok(queryCall.fields.arg instanceof Uint8Array);
});

test('raw Registry client calls get_value and returns node record', async () => {
  const nodeId = Principal.fromText('2vxsx-fae').toText();
  const nodeOperatorId = Principal.fromText('uuc56-gyb').toText();
  let queryCall = null;
  const client = createRawRegistryClient({
    registryCanisterId: 'rwlgt-iiaaa-aaaaa-aaaaa-cai',
    agent: {
      query: async (canisterId, fields) => {
        queryCall = { canisterId, fields };
        return {
          status: 'replied',
          reply: {
            arg: getValueResponseFixture(nodeRecordFixture(nodeOperatorId)),
          },
        };
      },
    },
  });

  assert.deepEqual(await client.getNodeRecord(nodeId), {
    nodeId,
    nodeOperatorId,
    publicIpv4: {
      ipAddr: '203.0.113.10',
      gatewayIpAddr: ['203.0.113.1'],
      prefixLength: 24,
    },
    domain: 'node.example.com',
    httpEndpoint: null,
    xnetEndpoint: null,
    hostosVersionId: null,
    rewardType: null,
  });
  assert.equal(queryCall.canisterId, 'rwlgt-iiaaa-aaaaa-aaaaa-cai');
  assert.equal(queryCall.fields.methodName, 'get_value');
  assert.ok(new TextDecoder().decode(queryCall.fields.arg).includes(`node_record_${nodeId}`));
});

test('raw Registry client surfaces missing key Registry errors', async () => {
  const registryError = bytesField(1, concatBytes([
    varintField(1, 1),
    bytesField(2, new TextEncoder().encode('missing key')),
  ]));
  const client = createRawRegistryClient({
    registryCanisterId: 'rwlgt-iiaaa-aaaaa-aaaaa-cai',
    agent: {
      query: async () => ({
        status: 'replied',
        reply: { arg: registryError },
      }),
    },
  });

  await assert.rejects(
    () => client.listSubnetIds(),
    (error) => {
      assert.equal(error instanceof IcTopologyError, true);
      assert.equal(error.code, TOPOLOGY_ERROR_CODES.REGISTRY_RECORD_UNAVAILABLE);
      return true;
    },
  );
});

test('raw Registry client surfaces get_value call failures', async () => {
  const client = createRawRegistryClient({
    registryCanisterId: 'rwlgt-iiaaa-aaaaa-aaaaa-cai',
    agent: {
      query: async () => { throw new Error('query failed'); },
    },
  });

  await assert.rejects(
    () => client.listSubnetIds(),
    (error) => {
      assert.equal(error instanceof IcTopologyError, true);
      assert.equal(error.code, TOPOLOGY_ERROR_CODES.REGISTRY_CALL_FAILED);
      return true;
    },
  );
});

test('raw Registry client surfaces get_value decode errors', async () => {
  const client = createRawRegistryClient({
    registryCanisterId: 'rwlgt-iiaaa-aaaaa-aaaaa-cai',
    agent: {
      query: async () => ({
        status: 'replied',
        reply: { arg: Uint8Array.from([0xff]) },
      }),
    },
  });

  await assert.rejects(
    () => client.listSubnetIds(),
    (error) => {
      assert.equal(error instanceof IcTopologyError, true);
      assert.equal(error.code, TOPOLOGY_ERROR_CODES.REGISTRY_RECORD_DECODE_FAILED);
      return true;
    },
  );
});

test('raw Registry client surfaces chunked large value responses as unsupported', async () => {
  const client = createRawRegistryClient({
    registryCanisterId: 'rwlgt-iiaaa-aaaaa-aaaaa-cai',
    agent: {
      query: async () => ({
        status: 'replied',
        reply: { arg: largeValueResponseFixture() },
      }),
    },
  });

  await assert.rejects(
    () => client.listSubnetIds(),
    (error) => {
      assert.equal(error instanceof IcTopologyError, true);
      assert.equal(error.code, TOPOLOGY_ERROR_CODES.REGISTRY_LARGE_VALUE_UNSUPPORTED);
      return true;
    },
  );
});

test('raw Registry client returns versioned node records', async () => {
  const nodeId = Principal.fromText('2vxsx-fae').toText();
  const nodeOperatorId = Principal.fromText('uuc56-gyb').toText();
  const client = createRawRegistryClient({
    registryCanisterId: 'rwlgt-iiaaa-aaaaa-aaaaa-cai',
    agent: {
      query: async () => ({
        status: 'replied',
        reply: {
          arg: getValueResponseFixture(nodeRecordFixture(nodeOperatorId), 99),
        },
      }),
    },
  });

  const versioned = await client.getNodeRecordWithVersion(nodeId);
  assert.equal(versioned.version, 99n);
  assert.equal(versioned.nodeRecord.nodeId, nodeId);
});
