import assert from 'node:assert/strict';
import test from 'node:test';
import { LookupPathStatus } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';

import {
  NNS_SUBNET_ID,
  readApiBoundaryMembership,
} from '../src/data/topology/api-boundary-membership.js';

function agent({ readState = async () => ({ certificate: new Uint8Array([1]) }), rootKey = new Uint8Array([2]) } = {}) {
  return {
    rootKey,
    readSubnetState: readState,
  };
}

function certificate(statusByCall) {
  let calls = 0;
  return {
    lookup_path: () => {
      const status = statusByCall[calls] ?? LookupPathStatus.Absent;
      calls += 1;
      if (status === LookupPathStatus.Found) {
        return { status, value: new TextEncoder().encode('value') };
      }
      return { status };
    },
  };
}

test('certified API boundary membership returns node when any path is found', async () => {
  const result = await readApiBoundaryMembership({
    agent: agent(),
    nodeIds: ['2vxsx-fae'],
    createCertificate: async () => certificate([
      LookupPathStatus.Absent,
      LookupPathStatus.Absent,
      LookupPathStatus.Found,
    ]),
  });
  assert.deepEqual(result.nodeIds, ['2vxsx-fae']);
  assert.deepEqual(result.apiBoundaryNodeIds, ['2vxsx-fae']);
  assert.equal(result.available, true);
  assert.deepEqual(result.errors, []);
});

test('certified API boundary membership treats absent paths as known non-membership', async () => {
  const result = await readApiBoundaryMembership({
    agent: agent(),
    nodeIds: ['2vxsx-fae'],
    createCertificate: async () => certificate([
      LookupPathStatus.Absent,
      LookupPathStatus.Absent,
      LookupPathStatus.Absent,
    ]),
  });
  assert.deepEqual(result.nodeIds, []);
  assert.deepEqual(result.apiBoundaryNodeIds, []);
  assert.equal(result.available, true);
});

test('certified API boundary membership warns on invalid node principals', async () => {
  const result = await readApiBoundaryMembership({
    agent: agent(),
    nodeIds: ['not-a-principal'],
    createCertificate: async () => certificate([]),
  });
  assert.deepEqual(result.apiBoundaryNodeIds, []);
  assert.equal(result.available, true);
  assert.equal(result.warnings.length, 1);
});

test('certified API boundary membership surfaces read failure as unavailable', async () => {
  const result = await readApiBoundaryMembership({
    agent: agent({ readState: async () => { throw new Error('unavailable'); } }),
    nodeIds: ['2vxsx-fae'],
    createCertificate: async () => certificate([]),
  });
  assert.deepEqual(result.apiBoundaryNodeIds, []);
  assert.equal(result.available, false);
  assert.equal(result.warnings.length, 1);
});

test('certified API boundary membership builds exact principal-byte paths', async () => {
  const nodeId = '2vxsx-fae';
  let capturedSubnet = null;
  let capturedPaths = null;
  const result = await readApiBoundaryMembership({
    agent: agent({
      readState: async (subnet, request) => {
        capturedSubnet = subnet;
        capturedPaths = request.paths;
        return { certificate: new Uint8Array([1]) };
      },
    }),
    nodeIds: [nodeId],
    createCertificate: async () => certificate([
      LookupPathStatus.Absent,
      LookupPathStatus.Absent,
      LookupPathStatus.Absent,
    ]),
  });

  assert.equal(result.available, true);
  assert.equal(capturedSubnet.toText(), NNS_SUBNET_ID);
  assert.equal(capturedPaths.length, 3);
  const labels = capturedPaths.map((path) => path.map((item) => Array.from(item)));
  const text = (value) => Array.from(new TextEncoder().encode(value));
  const nodeBytes = Array.from(Principal.fromText(nodeId).toUint8Array());
  const nodeTextBytes = text(nodeId);
  assert.deepEqual(labels, [
    [text('api_boundary_nodes'), nodeBytes, text('domain')],
    [text('api_boundary_nodes'), nodeBytes, text('ipv4_address')],
    [text('api_boundary_nodes'), nodeBytes, text('ipv6_address')],
  ]);
  assert.notDeepEqual(nodeBytes, nodeTextBytes);
});

test('certified API boundary membership passes root key and NNS subnet context to Certificate.create', async () => {
  const rootKey = new Uint8Array([9, 9, 9]);
  const encodedCertificate = new Uint8Array([7, 7, 7]);
  let createArgs = null;
  const result = await readApiBoundaryMembership({
    agent: agent({
      rootKey,
      readState: async () => ({ certificate: encodedCertificate }),
    }),
    nodeIds: ['2vxsx-fae'],
    createCertificate: async (args) => {
      createArgs = args;
      return certificate([
        LookupPathStatus.Absent,
        LookupPathStatus.Absent,
        LookupPathStatus.Absent,
      ]);
    },
  });

  assert.equal(result.available, true);
  assert.equal(createArgs.certificate, encodedCertificate);
  assert.equal(createArgs.rootKey, rootKey);
  assert.equal(createArgs.principal.subnetId.toText(), NNS_SUBNET_ID);
});

test('certified API boundary membership never treats unverified data as available', async () => {
  const result = await readApiBoundaryMembership({
    agent: agent(),
    nodeIds: ['2vxsx-fae'],
    createCertificate: async () => {
      throw new Error('bad certificate');
    },
  });

  assert.deepEqual(result.nodeIds, []);
  assert.equal(result.available, false);
  assert.equal(result.warnings[0].code, 'VALIDATION_FAILED');
});

test('certified API boundary membership treats unknown lookup state as unavailable', async () => {
  const result = await readApiBoundaryMembership({
    agent: agent(),
    nodeIds: ['2vxsx-fae'],
    createCertificate: async () => certificate([
      LookupPathStatus.Absent,
      LookupPathStatus.Unknown,
      LookupPathStatus.Absent,
    ]),
  });

  assert.deepEqual(result.nodeIds, []);
  assert.equal(result.available, false);
  assert.equal(result.warnings[0].code, 'PARTIAL_TOPOLOGY');
});
