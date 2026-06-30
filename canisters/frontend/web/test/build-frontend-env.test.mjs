import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  NODE_METRICS_PROXY_ENV,
  resolveFrontendEnv,
} from '../build-frontend-env.mjs';

async function tempProject() {
  return mkdtemp(path.join(os.tmpdir(), 'nnx-frontend-env-'));
}

async function writeMapping(root, file, id) {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), `${JSON.stringify({ nnx_node_metrics_proxy: id })}\n`);
}

async function writeMalformedMapping(root, file) {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), '{not-json');
}

test('explicit NNX_NODE_METRICS_PROXY_CANISTER_ID wins', async () => {
  const root = await tempProject();
  await writeMapping(root, '.icp/cache/mappings/local.ids.json', 'local-id');
  const result = await resolveFrontendEnv({
    projectRoot: root,
    env: { ICP_NETWORK: 'local', NNX_NODE_METRICS_PROXY_CANISTER_ID: 'explicit-id' },
  });
  assert.equal(result.env[NODE_METRICS_PROXY_ENV], 'explicit-id');
});

test('explicit PUBLIC_CANISTER_ID wins', async () => {
  const root = await tempProject();
  const result = await resolveFrontendEnv({
    projectRoot: root,
    env: { [NODE_METRICS_PROXY_ENV]: 'public-id' },
  });
  assert.equal(result.env[NODE_METRICS_PROXY_ENV], 'public-id');
});

test('ICP_NETWORK=local reads only local mapping', async () => {
  const root = await tempProject();
  await writeMapping(root, '.icp/cache/mappings/local.ids.json', 'local-cache-id');
  await writeMapping(root, '.icp/data/mappings/ic.ids.json', 'ic-id');
  const result = await resolveFrontendEnv({ projectRoot: root, env: { ICP_NETWORK: 'local' } });
  assert.equal(result.env[NODE_METRICS_PROXY_ENV], 'local-cache-id');
});

test('ICP_NETWORK=ic reads only ic mapping', async () => {
  const root = await tempProject();
  await writeMapping(root, '.icp/cache/mappings/local.ids.json', 'local-id');
  await writeMapping(root, '.icp/data/mappings/ic.ids.json', 'ic-id');
  const result = await resolveFrontendEnv({ projectRoot: root, env: { ICP_NETWORK: 'ic' } });
  assert.equal(result.env[NODE_METRICS_PROXY_ENV], 'ic-id');
});

test('no network and no env produces null', async () => {
  const root = await tempProject();
  await writeMapping(root, '.icp/cache/mappings/local.ids.json', 'local-id');
  const result = await resolveFrontendEnv({ projectRoot: root, env: {} });
  assert.equal(result.env[NODE_METRICS_PROXY_ENV], null);
});

test('local mapping is not used for ic network', async () => {
  const root = await tempProject();
  await writeMapping(root, '.icp/cache/mappings/local.ids.json', 'local-id');
  const result = await resolveFrontendEnv({ projectRoot: root, env: { ICP_NETWORK: 'ic' } });
  assert.equal(result.env[NODE_METRICS_PROXY_ENV], null);
});

test('ic mapping is not used for local network', async () => {
  const root = await tempProject();
  await writeMapping(root, '.icp/data/mappings/ic.ids.json', 'ic-id');
  const result = await resolveFrontendEnv({ projectRoot: root, env: { ICP_NETWORK: 'local' } });
  assert.equal(result.env[NODE_METRICS_PROXY_ENV], null);
});

test('malformed mapping produces null and warning', async () => {
  const root = await tempProject();
  await writeMalformedMapping(root, '.icp/data/mappings/ic.ids.json');
  const result = await resolveFrontendEnv({ projectRoot: root, env: { ICP_NETWORK: 'ic' } });
  assert.equal(result.env[NODE_METRICS_PROXY_ENV], null);
  assert.equal(result.warnings.length, 1);
});
