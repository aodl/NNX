const DEFAULT_TOPOLOGY_CACHE_TTL_MS = 60_000;

export function createTopologyCache({ ttlMs = DEFAULT_TOPOLOGY_CACHE_TTL_MS } = {}) {
  let cached = null;
  let fetchedAtMs = 0;
  let inFlight = null;
  let generation = 0;

  function isFresh(now = Date.now()) {
    return cached !== null && now - fetchedAtMs < ttlMs;
  }

  async function get(fetcher, { refresh = false } = {}) {
    if (!refresh && isFresh()) return cached;
    if (!refresh && inFlight) return inFlight;

    const requestGeneration = generation;
    const promise = Promise.resolve()
      .then(fetcher)
      .then((value) => {
        if (requestGeneration === generation) {
          cached = value;
          fetchedAtMs = Date.now();
        }
        return value;
      })
      .finally(() => {
        if (inFlight === promise) {
          inFlight = null;
        }
      });

    inFlight = promise;
    return inFlight;
  }

  function clear() {
    generation += 1;
    cached = null;
    fetchedAtMs = 0;
    inFlight = null;
  }

  return Object.freeze({ get, clear });
}
