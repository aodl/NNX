import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadProto, parseTopicEnum } from '../../../../tools/scripts/generate-nns-topics.mjs';

const proto = 'enum Topic {\n  TOPIC_UNSPECIFIED = 0;\n  TOPIC_GOVERNANCE = 4;\n}';

test('topic generation uses upstream fetch success', async () => {
  const loaded = await loadProto({
    fetchImpl: async () => ({ ok: true, text: async () => proto }),
    cachePathOverride: '/missing/cache.proto',
  });
  assert.equal(loaded, proto);
  assert.deepEqual(parseTopicEnum(loaded), [{ protoName: 'TOPIC_GOVERNANCE', id: 4 }]);
});

test('topic generation uses pinned cache after upstream failure', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nnx-topic-'));
  const cache = path.join(dir, 'governance.proto');
  await writeFile(cache, proto);
  try {
    const loaded = await loadProto({
      fetchImpl: async () => { throw new Error('offline'); },
      cachePathOverride: cache,
    });
    assert.equal(loaded, proto);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('topic generation fails without upstream or cache by default', async () => {
  await assert.rejects(() => loadProto({
    fetchImpl: async () => { throw new Error('offline'); },
    cachePathOverride: '/missing/cache.proto',
    allowEmbedded: false,
  }), /Could not fetch upstream/);
});

test('topic generation embedded fallback requires explicit enablement', async () => {
  const loaded = await loadProto({
    fetchImpl: async () => { throw new Error('offline'); },
    cachePathOverride: '/missing/cache.proto',
    allowEmbedded: true,
  });
  assert.match(loaded, /TOPIC_API_BOUNDARY_NODE_MANAGEMENT/);
});

test('committed governance.proto cache is present and readable', async () => {
  const cachePath = path.resolve('tools/cache/governance.proto');
  await access(cachePath);
  const cachedProto = await readFile(cachePath, 'utf8');
  assert.match(cachedProto, /\benum\s+Topic\s*\{/);
});
