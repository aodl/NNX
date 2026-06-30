import assert from 'node:assert/strict';
import test from 'node:test';
import { LookupPathStatus } from '@icp-sdk/core/agent';

import { readApiBoundaryMembership } from '../src/data/topology/api-boundary-membership.js';

function agent({ readState = async () => ({ certificate: new Uint8Array([1]) }) } = {}) {
  return {
    rootKey: new Uint8Array([2]),
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
    createCertificate: async () => certificate([LookupPathStatus.Found, LookupPathStatus.Absent]),
  });
  assert.deepEqual(result.apiBoundaryNodeIds, ['2vxsx-fae']);
  assert.equal(result.available, true);
});

test('certified API boundary membership treats absent paths as known non-membership', async () => {
  const result = await readApiBoundaryMembership({
    agent: agent(),
    nodeIds: ['2vxsx-fae'],
    createCertificate: async () => certificate([LookupPathStatus.Absent, LookupPathStatus.Absent]),
  });
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
