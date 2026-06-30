import assert from 'node:assert/strict';
import test from 'node:test';

import { createRequestCache } from '../src/data/request-cache.js';

test('request cache deduplicates in-flight requests', async () => {
  const cache = createRequestCache();
  let calls = 0;
  const loader = async () => {
    calls += 1;
    return 'ok';
  };
  const [a, b] = await Promise.all([cache.get('k', loader), cache.get('k', loader)]);
  assert.equal(a, 'ok');
  assert.equal(b, 'ok');
  assert.equal(calls, 1);
});

test('request cache retries after failure', async () => {
  const cache = createRequestCache();
  let calls = 0;
  await assert.rejects(() => cache.get('k', async () => {
    calls += 1;
    throw new Error('fail');
  }));
  assert.equal(await cache.get('k', async () => {
    calls += 1;
    return 'ok';
  }), 'ok');
  assert.equal(calls, 2);
});
