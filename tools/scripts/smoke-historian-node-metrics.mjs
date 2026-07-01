#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { HttpAgent } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { createHistorianActor } from '../../canisters/frontend/web/src/data/node-health-metrics/historian-client.js';

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(import.meta.dirname, '../..');
const HISTORIAN_ENV = 'PUBLIC_CANISTER_ID:nnx_historian';
const HISTORIAN_ALIAS_ENV = 'NNX_HISTORIAN_CANISTER_ID';
const LEGACY_HISTORIAN_ENV = 'PUBLIC_CANISTER_ID:nnx_node_metrics_proxy';
const LEGACY_HISTORIAN_ALIAS_ENV = 'NNX_NODE_METRICS_PROXY_CANISTER_ID';
const DEFAULT_SUBNET_ID = 'tdb26-jop6k-aogll-7ltgs-eruif-6kk7m-qpktf-gdiqx-mxtrf-vb5e6-eqe';

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function readJsonIfExists(file) {
  try {
    return JSON.parse(await readFile(path.join(projectRoot, file), 'utf8'));
  } catch {
    return null;
  }
}

async function resolveCanisterId(network) {
  if (process.env[HISTORIAN_ALIAS_ENV]) return process.env[HISTORIAN_ALIAS_ENV];
  if (process.env[HISTORIAN_ENV]) return process.env[HISTORIAN_ENV];
  if (process.env[LEGACY_HISTORIAN_ALIAS_ENV]) return process.env[LEGACY_HISTORIAN_ALIAS_ENV];
  if (process.env[LEGACY_HISTORIAN_ENV]) return process.env[LEGACY_HISTORIAN_ENV];
  const files = network === 'local'
    ? ['.icp/cache/mappings/local.ids.json', '.icp/data/mappings/local.ids.json']
    : ['.icp/data/mappings/ic.ids.json'];
  for (const file of files) {
    const mapping = await readJsonIfExists(file);
    if (typeof mapping?.nnx_historian === 'string') return mapping.nnx_historian;
  }
  throw new Error(`Could not resolve nnx_historian canister ID for ${network}.`);
}

async function localHost() {
  const { stdout } = await execFileAsync('icp', ['network', 'status', '--json'], { cwd: projectRoot });
  const status = JSON.parse(stdout);
  return status.api_url ?? status.gateway_url ?? 'http://localhost:4943/';
}

function normalizeResponse(response) {
  return {
    partial: Boolean(response.partial),
    errors: (response.errors ?? []).map((error) => ({
      code: String(error.code ?? ''),
      message: String(error.message ?? ''),
    })),
    records: response.records ?? [],
  };
}

const network = argValue('--network') ?? process.env.ICP_NETWORK ?? 'local';
if (!['local', 'ic'].includes(network)) {
  throw new Error('--network must be local or ic.');
}

const subnetId = argValue('--subnet-id') ?? process.env.NNX_NODE_METRICS_SUBNET_ID ?? DEFAULT_SUBNET_ID;
const historianCanisterId = await resolveCanisterId(network);
const host = network === 'local' ? await localHost() : 'https://icp-api.io';
const agent = await HttpAgent.create({ host, verifyQuerySignatures: true });
if (network === 'local') await agent.fetchRootKey();

const actor = createHistorianActor({ agent, canisterId: historianCanisterId });
const endAtTimestampNanos = BigInt(Date.now()) * 1_000_000n;
const startAtTimestampNanos = endAtTimestampNanos - 60n * 60n * 1_000_000_000n;

console.log(`Historian: ${historianCanisterId}`);
console.log(`Network: ${network}`);
console.log(`Subnet: ${subnetId}`);

let response;
try {
  response = normalizeResponse(await actor.get_node_metrics_history({
    subnet_id: Principal.fromText(subnetId),
    start_at_timestamp_nanos: startAtTimestampNanos,
    end_at_timestamp_nanos: endAtTimestampNanos,
  }));
} catch (error) {
  console.error('Valid historian call trapped or rejected before typed response.');
  throw error;
}

const errorCodes = response.errors.map((error) => error.code);
if (errorCodes.includes('MANAGEMENT_CANISTER_DECODE_FAILED')) {
  throw new Error('Management canister response decode failed.');
}
const acceptable = errorCodes.length === 0
  || errorCodes.every((code) => code === 'MANAGEMENT_CANISTER_CALL_FAILED' || code === 'RESPONSE_TRUNCATED');
if (!acceptable) {
  throw new Error(`Unexpected historian errors: ${errorCodes.join(', ')}`);
}

console.log(`Records: ${response.records.length}`);
console.log(`Partial: ${response.partial}`);
console.log(`Errors: ${response.errors.length ? response.errors.map((error) => error.code).join(', ') : 'none'}`);
console.log('Valid path management call exercised without trap.');
