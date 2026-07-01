import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateMembershipSmoke,
  formatOutput,
  readArgs,
} from '../../../../tools/scripts/smoke-api-boundary-membership.mjs';

const member = '2vxsx-fae';
const nonMember = 'uuc56-gyb';

function result({ available = true, nodeIds = [], warnings = [], errors = [] } = {}) {
  return { available, nodeIds, warnings, errors };
}

test('API boundary smoke parses positive canary env var', () => {
  const args = readArgs(['--network', 'ic'], {
    NNX_API_BOUNDARY_MEMBER_CANARY_NODE_ID: member,
  });
  assert.deepEqual(args.nodeIds, [member]);
  assert.deepEqual(args.expectMembers, [member]);
});

test('API boundary smoke parses negative canary path', () => {
  const args = readArgs(['--network', 'ic', '--node-id', nonMember, '--expect-non-member', nonMember], {});
  assert.deepEqual(args.nodeIds, [nonMember]);
  assert.deepEqual(args.expectNonMembers, [nonMember]);
});

test('API boundary smoke supports multiple node IDs and de-duplicates expectations', () => {
  const args = readArgs([
    '--network', 'ic',
    '--node-id', member,
    '--node-id', nonMember,
    '--expect-member', member,
    '--expect-non-member', nonMember,
    '--expect-non-member', nonMember,
  ], {});
  assert.deepEqual(args.nodeIds, [member, nonMember]);
  assert.deepEqual(args.expectMembers, [member]);
  assert.deepEqual(args.expectNonMembers, [nonMember]);
});

test('API boundary smoke treats available true plus empty result as known non-membership', () => {
  const args = readArgs(['--network', 'ic', '--expect-non-member', nonMember], {});
  const evaluation = evaluateMembershipSmoke({
    args,
    result: result({ available: true, nodeIds: [] }),
    output: {},
    env: {},
  });
  assert.equal(evaluation.ok, true);
});

test('API boundary smoke prints available, returned member node IDs, warnings, and errors', () => {
  const output = formatOutput({
    network: 'ic',
    host: 'https://icp-api.io',
    result: result({
      available: false,
      nodeIds: [member],
      warnings: [{ message: 'warning' }],
      errors: [{ message: 'error' }],
    }),
  });
  assert.equal(output.available, false);
  assert.deepEqual(output.returnedMemberNodeIds, [member]);
  assert.deepEqual(output.warnings, [{ message: 'warning' }]);
  assert.deepEqual(output.errors, [{ message: 'error' }]);
});

test('API boundary smoke fails available false with warnings', () => {
  const args = readArgs(['--network', 'ic', '--node-id', nonMember], {});
  const output = formatOutput({
    network: 'ic',
    host: 'https://icp-api.io',
    result: result({ available: false, warnings: [{ message: 'unavailable' }] }),
  });
  const evaluation = evaluateMembershipSmoke({
    args,
    result: result({ available: false, warnings: [{ message: 'unavailable' }] }),
    output,
    env: {},
  });
  assert.equal(evaluation.ok, false);
  assert.match(evaluation.message, /unavailable/);
});

test('API boundary smoke fails expected-member mismatch', () => {
  const args = readArgs(['--network', 'ic', '--expect-member', member], {});
  const evaluation = evaluateMembershipSmoke({
    args,
    result: result({ available: true, nodeIds: [] }),
    output: {},
    env: {},
  });
  assert.equal(evaluation.ok, false);
  assert.match(evaluation.message, /Expected API boundary member/);
});

test('API boundary smoke fails expected-non-member mismatch', () => {
  const args = readArgs(['--network', 'ic', '--expect-non-member', member], {});
  const evaluation = evaluateMembershipSmoke({
    args,
    result: result({ available: true, nodeIds: [member] }),
    output: {},
    env: {},
  });
  assert.equal(evaluation.ok, false);
  assert.match(evaluation.message, /Expected non-member/);
});
