export function createRequestCache({ debug = false } = {}) {
  const values = new Map();

  async function get(key, loader) {
    if (values.has(key)) return values.get(key);
    const started = performance?.now?.() ?? Date.now();
    const promise = Promise.resolve()
      .then(loader)
      .finally(() => {
        if (debug) {
          const elapsed = ((performance?.now?.() ?? Date.now()) - started).toFixed(1);
          console.debug(`[nnx] ${key} ${elapsed}ms`);
        }
      });
    values.set(key, promise);
    try {
      return await promise;
    } catch (error) {
      values.delete(key);
      throw error;
    }
  }

  return Object.freeze({
    get,
    clear: () => values.clear(),
    size: () => values.size,
  });
}
