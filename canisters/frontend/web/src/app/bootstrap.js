import { parseRoute } from './router.js';
import { createAgentQueryBackend } from '../data/query/agent-query-backend.js';
import { createIcQueryFacade } from '../data/query/ic-query-facade.js';
import { createNeuronLoader } from '../data/neuron-loader.js';
import { renderNeuronPage } from '../ui/neuron-page.js';
import { renderNotFoundPage } from '../ui/not-found-page.js';

export async function bootstrap({ windowRef = window, documentRef = document } = {}) {
  const root = documentRef.getElementById('app');
  if (!root) throw new Error('Missing #app root element');

  const route = parseRoute(windowRef.location.pathname);
  if (route.kind === 'not_found') {
    renderNotFoundPage(root);
    return;
  }

  const hostname = windowRef.location.hostname;
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  const host = local ? windowRef.location.origin : 'https://icp0.io';
  const queryBackend = await createAgentQueryBackend({ host, local });
  const queryFacade = createIcQueryFacade({ backend: queryBackend });
  const neuronLoader = createNeuronLoader({ queryFacade });

  await renderNeuronPage(root, { neuronId: route.neuronId, neuronLoader });
}
