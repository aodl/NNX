import assert from 'node:assert/strict';
import test from 'node:test';

import { createBuildInfo } from '../build-info.mjs';

function fakeExecFile({ commit = 'abc123', dirty = false, fail = false } = {}) {
  return async (_cmd, args) => {
    if (fail) throw new Error('git unavailable');
    if (args[0] === 'rev-parse') return { stdout: `${commit}\n` };
    if (args[0] === 'status') return { stdout: dirty ? ' M file.js\n' : '' };
    throw new Error(`unexpected git args: ${args.join(' ')}`);
  };
}

test('build info records staging deployment fields and historian ID', async () => {
  const info = await createBuildInfo({
    projectRoot: '/repo',
    env: {
      ICP_NETWORK: 'ic',
      NNX_DEPLOY_ENVIRONMENT: 'staging',
      NNX_FRONTEND_CANISTER_ID: '6h2pa-qiaaa-aaaao-qp4fa-cai',
      NNX_HISTORIAN_CANISTER_ID: 'yo47z-piaaa-aaaac-qg3xa-cai',
    },
    now: () => new Date('2026-07-01T00:00:00.000Z'),
    execFileImpl: fakeExecFile({ commit: 'commit-id', dirty: false }),
  });

  assert.deepEqual(info, {
    gitCommit: 'commit-id',
    builtAt: '2026-07-01T00:00:00.000Z',
    network: 'ic',
    environment: 'staging',
    frontendCanisterId: '6h2pa-qiaaa-aaaao-qp4fa-cai',
    historianCanisterId: 'yo47z-piaaa-aaaac-qg3xa-cai',
    repoDirty: false,
  });
});

test('build info falls back to generated historian env and dirty repo flag', async () => {
  const info = await createBuildInfo({
    projectRoot: '/repo',
    env: { ICP_ENV: 'local' },
    frontendEnv: { 'PUBLIC_CANISTER_ID:nnx_historian': 'historian-from-env-json' },
    now: () => new Date('2026-07-01T00:00:00.000Z'),
    execFileImpl: fakeExecFile({ dirty: true }),
  });

  assert.equal(info.network, 'local');
  assert.equal(info.environment, 'local');
  assert.equal(info.historianCanisterId, 'historian-from-env-json');
  assert.equal(info.repoDirty, true);
});

test('build info tolerates unavailable git', async () => {
  const info = await createBuildInfo({
    projectRoot: '/repo',
    env: {},
    now: () => new Date('2026-07-01T00:00:00.000Z'),
    execFileImpl: fakeExecFile({ fail: true }),
  });

  assert.equal(info.gitCommit, null);
  assert.equal(info.network, 'unknown');
  assert.equal(info.environment, 'unknown');
  assert.equal(info.repoDirty, null);
});
