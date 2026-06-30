#!/usr/bin/env node

import { HttpAgent } from '@icp-sdk/core/agent';
import { readApiBoundaryMembership } from '../../canisters/frontend/web/src/data/topology/api-boundary-membership.js';

const MAINNET_HOST = 'https://icp-api.io';
const LOCAL_HOST = process.env.ICP_REPLICA_URL ?? 'http://localhost:8000';

function usage() {
  return [
    'Usage: npm run smoke:api-boundary-membership -- --network <local|ic> --node-id <node-id> [--node-id <node-id> ...]',
    '       [--expect-member <node-id>] [--expect-non-member <node-id>]',
    '',
    'Optional positive canary: NNX_API_BOUNDARY_MEMBER_CANARY_NODE_ID=<node-id>',
    'Local unsupported certified-state behavior may be allowed with:',
    'NNX_ALLOW_UNSUPPORTED_LOCAL_CERTIFIED_STATE=1',
  ].join('\n');
}

function readArgs(argv) {
  const args = {
    network: null,
    nodeIds: [],
    expectMembers: [],
    expectNonMembers: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--network') {
      args.network = value;
      index += 1;
    } else if (flag === '--node-id') {
      args.nodeIds.push(value);
      index += 1;
    } else if (flag === '--expect-member') {
      args.expectMembers.push(value);
      args.nodeIds.push(value);
      index += 1;
    } else if (flag === '--expect-non-member') {
      args.expectNonMembers.push(value);
      args.nodeIds.push(value);
      index += 1;
    } else if (flag === '--help' || flag === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  if (process.env.NNX_API_BOUNDARY_MEMBER_CANARY_NODE_ID) {
    args.expectMembers.push(process.env.NNX_API_BOUNDARY_MEMBER_CANARY_NODE_ID);
    args.nodeIds.push(process.env.NNX_API_BOUNDARY_MEMBER_CANARY_NODE_ID);
  }
  args.nodeIds = [...new Set(args.nodeIds.filter(Boolean))];
  args.expectMembers = [...new Set(args.expectMembers.filter(Boolean))];
  args.expectNonMembers = [...new Set(args.expectNonMembers.filter(Boolean))];
  return args;
}

function fail(message, result = null) {
  if (result) {
    console.error(JSON.stringify(result, null, 2));
  }
  console.error(message);
  process.exit(1);
}

const args = readArgs(process.argv.slice(2));
if (args.network !== 'local' && args.network !== 'ic') {
  fail(`Missing or invalid --network.\n${usage()}`);
}
if (args.nodeIds.length === 0) {
  fail(`At least one --node-id or expectation is required.\n${usage()}`);
}

const host = args.network === 'ic' ? MAINNET_HOST : LOCAL_HOST;
const agent = await HttpAgent.create({
  host,
  verifyQuerySignatures: true,
});

if (args.network === 'local') {
  await agent.fetchRootKey();
}

const result = await readApiBoundaryMembership({ agent, nodeIds: args.nodeIds });
const output = {
  network: args.network,
  host,
  available: result.available,
  nodeIds: result.nodeIds,
  warnings: result.warnings,
  errors: result.errors,
};
console.log(JSON.stringify(output, null, 2));

if (!result.available) {
  if (
    args.network === 'local'
    && process.env.NNX_ALLOW_UNSUPPORTED_LOCAL_CERTIFIED_STATE === '1'
  ) {
    process.exit(0);
  }
  fail('Certified API boundary membership is unavailable.', output);
}

const members = new Set(result.nodeIds);
for (const nodeId of args.expectMembers) {
  if (!members.has(nodeId)) {
    fail(`Expected API boundary member was not returned: ${nodeId}`, output);
  }
}
for (const nodeId of args.expectNonMembers) {
  if (members.has(nodeId)) {
    fail(`Expected non-member was returned as API boundary member: ${nodeId}`, output);
  }
}
