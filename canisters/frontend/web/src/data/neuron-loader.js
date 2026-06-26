export function createNeuronLoader({ queryFacade }) {
  const cache = new Map();

  async function loadNeuron(neuronId) {
    const key = neuronId.toString();
    if (!cache.has(key)) {
      cache.set(key, queryFacade.getNnsNeuron({ neuronId }));
    }
    return cache.get(key);
  }

  async function loadNeurons(neuronIds) {
    const missing = neuronIds.filter((id) => !cache.has(id.toString()));
    if (missing.length > 0) {
      const loaded = await queryFacade.getNnsNeurons({ neuronIds: missing });
      for (const neuron of loaded) {
        cache.set(neuron.id.toString(), Promise.resolve(neuron));
      }
    }
    return Promise.all(neuronIds.map((id) => loadNeuron(id)));
  }

  return Object.freeze({ loadNeuron, loadNeurons });
}
