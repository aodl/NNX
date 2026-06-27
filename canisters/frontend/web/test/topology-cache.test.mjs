import assert from 'node:assert/strict';
import test from 'node:test';
import { createTopologyCache } from '../src/data/topology/topology-cache.js';
import { mapWithConcurrency } from '../src/data/topology/topology-service.js';

test('topology cache returns cached values while fresh', async () => {
  const cache = createTopologyCache({ ttlMs: 60_000 });
  let calls = 0;
  const fetcher = async () => ({ call: ++calls });

  const first = await cache.get(fetcher);
  const second = await cache.get(fetcher);

  assert.equal(first, second);
  assert.equal(calls, 1);
});

test('topology cache misses after ttl expires', async () => {
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  try {
    const cache = createTopologyCache({ ttlMs: 10 });
    let calls = 0;
    const fetcher = async () => ({ call: ++calls });

    const first = await cache.get(fetcher);
    now += 11;
    const second = await cache.get(fetcher);

    assert.notEqual(first, second);
    assert.equal(calls, 2);
  } finally {
    Date.now = originalNow;
  }
});

test('topology cache deduplicates in-flight requests', async () => {
  const cache = createTopologyCache({ ttlMs: 60_000 });
  let calls = 0;
  let resolveFetch;
  const fetcher = () => {
    calls += 1;
    return new Promise((resolve) => {
      resolveFetch = resolve;
    });
  };

  const first = cache.get(fetcher);
  const second = cache.get(fetcher);
  await Promise.resolve();
  resolveFetch({ topology: true });

  assert.equal(await first, await second);
  assert.equal(calls, 1);
});

test('clearTopologyCache-style clear invalidates cached values', async () => {
  const cache = createTopologyCache({ ttlMs: 60_000 });
  let calls = 0;
  const fetcher = async () => ({ call: ++calls });

  await cache.get(fetcher);
  cache.clear();
  const second = await cache.get(fetcher);

  assert.equal(second.call, 2);
});

test('clear prevents older in-flight requests from repopulating the cache', async () => {
  const cache = createTopologyCache({ ttlMs: 60_000 });
  let calls = 0;
  let resolveFetch;
  const fetcher = () => {
    calls += 1;
    return new Promise((resolve) => {
      resolveFetch = resolve;
    });
  };

  const first = cache.get(fetcher);
  await Promise.resolve();
  cache.clear();
  resolveFetch({ call: calls });
  await first;

  const second = await cache.get(async () => ({ call: ++calls }));

  assert.equal(second.call, 2);
});


test('refresh bypasses cached values', async () => {
  const cache = createTopologyCache({ ttlMs: 60_000 });
  let calls = 0;
  const fetcher = async () => ({ call: ++calls });

  await cache.get(fetcher);
  const refreshed = await cache.get(fetcher, { refresh: true });

  assert.equal(refreshed.call, 2);
});

test('concurrency limiter caps active tasks', async () => {
  let active = 0;
  let maxActive = 0;

  const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return item * 2;
  });

  assert.deepEqual(results, [2, 4, 6, 8, 10]);
  assert.equal(maxActive, 2);
});
