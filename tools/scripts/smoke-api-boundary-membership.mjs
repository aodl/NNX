#!/usr/bin/env node

import { HttpAgent } from '@icp-sdk/core/agent';
import { readApiBoundaryMembership } from '../../canisters/frontend/web/src/data/topology/api-boundary-membership.js';

const MAINNET_HOST = 'https://icp-api.io';
const LOCAL_HOST = process.env.ICP_REPLICA_URL ?? 'http://localhost:8000';

export function usage() {
  return [
    'Usage: npm run smoke:api-boundary-membership -- --network <local|ic> --node-id <node-id> [--node-id <node-id> ...]',
    '       [--expect-member <node-id>] [--expect-non-member <node-id>]',
    '',
    'Optional positive canary: NNX_API_BOUNDARY_MEMBER_CANARY_NODE_ID=<node-id>',
    'Local unsupported certified-state behavior may be allowed with:',
    'NNX_ALLOW_UNSUPPORTED_LOCAL_CERTIFIED_STATE=1',
  ].join('\n');
}

export function readArgs(argv, env = process.env) {
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
      if (!value) throw new Error('--network requires a value');
      args.network = value;
      index += 1;
    } else if (flag === '--node-id') {
      if (!value) throw new Error('--node-id requires a value');
      args.nodeIds.push(value);
      index += 1;
    } else if (flag === '--expect-member') {
      if (!value) throw new Error('--expect-member requires a value');
      args.expectMembers.push(value);
      args.nodeIds.push(value);
      index += 1;
    } else if (flag === '--expect-non-member') {
      if (!value) throw new Error('--expect-non-member requires a value');
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
  if (env.NNX_API_BOUNDARY_MEMBER_CANARY_NODE_ID) {
    args.expectMembers.push(env.NNX_API_BOUNDARY_MEMBER_CANARY_NODE_ID);
    args.nodeIds.push(env.NNX_API_BOUNDARY_MEMBER_CANARY_NODE_ID);
  }
  args.nodeIds = [...new Set(args.nodeIds.filter(Boolean))];
  args.expectMembers = [...new Set(args.expectMembers.filter(Boolean))];
  args.expectNonMembers = [...new Set(args.expectNonMembers.filter(Boolean))];
  return args;
}

export function formatOutput({ network, host, result }) {
  return {
    network,
    host,
    available: result.available,
    returnedMemberNodeIds: result.nodeIds,
    nodeIds: result.nodeIds,
    warnings: result.warnings ?? [],
    errors: result.errors ?? [],
  };
}

export function evaluateMembershipSmoke({
  args,
  result,
  output,
  env = process.env,
} = {}) {
  if (!result.available) {
    if (
      args.network === 'local'
      && env.NNX_ALLOW_UNSUPPORTED_LOCAL_CERTIFIED_STATE === '1'
    ) {
      return { ok: true };
    }
    return { ok: false, message: 'Certified API boundary membership is unavailable.', output };
  }

  const members = new Set(result.nodeIds);
  for (const nodeId of args.expectMembers) {
    if (!members.has(nodeId)) {
      return { ok: false, message: `Expected API boundary member was not returned: ${nodeId}`, output };
    }
  }
  for (const nodeId of args.expectNonMembers) {
    if (members.has(nodeId)) {
      return { ok: false, message: `Expected non-member was returned as API boundary member: ${nodeId}`, output };
    }
  }
  return { ok: true };
}

function fail(message, result = null) {
  if (result) console.error(JSON.stringify(result, null, 2));
  console.error(message);
  process.exit(1);
}

export async function runSmoke({ argv = process.argv.slice(2), env = process.env } = {}) {
  const args = readArgs(argv, env);
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
  const output = formatOutput({ network: args.network, host, result });
  console.log(JSON.stringify(output, null, 2));

  const evaluation = evaluateMembershipSmoke({ args, result, output, env });
  if (!evaluation.ok) fail(evaluation.message, evaluation.output);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    await runSmoke();
  } catch (error) {
    fail(error.message);
  }
}
