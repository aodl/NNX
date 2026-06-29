import { parseRoute } from './router.js';
import { createAgentQueryBackend } from '../data/query/agent-query-backend.js';
import { createIcQueryFacade } from '../data/query/ic-query-facade.js';
import { createNeuronLoader } from '../data/neuron-loader.js';
import { createProposalLoader } from '../data/proposal-loader.js';
import { createSubnetLoader } from '../data/subnet-loader.js';
import { renderHomePage } from '../ui/home-page.js';
import { renderNeuronPage } from '../ui/neuron-page.js';
import { renderNotFoundPage } from '../ui/not-found-page.js';
import { renderProposalPage } from '../ui/proposal-page.js';
import { renderSubnetPage } from '../ui/subnet-page.js';

async function createQueryFacade(windowRef) {
  const hostname = windowRef.location.hostname;
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  const host = local ? windowRef.location.origin : 'https://icp0.io';
  const queryBackend = await createAgentQueryBackend({ host, local });
  return createIcQueryFacade({ backend: queryBackend });
}

export async function bootstrap({ windowRef = window, documentRef = document } = {}) {
  const root = documentRef.getElementById('app');
  if (!root) throw new Error('Missing #app root element');

  const route = parseRoute(windowRef.location.pathname);
  if (route.kind === 'not_found') {
    renderNotFoundPage(root);
    return;
  }

  const queryFacade = await createQueryFacade(windowRef);

  if (route.kind === 'home') {
    const proposalLoader = createProposalLoader({ queryFacade });
    const subnetLoader = createSubnetLoader({ queryFacade });
    await renderHomePage(root, { proposalLoader, subnetLoader });
    return;
  }

  if (route.kind === 'proposal') {
    const proposalLoader = createProposalLoader({ queryFacade });
    const subnetLoader = createSubnetLoader({ queryFacade });
    await renderProposalPage(root, { proposalId: route.proposalId, proposalLoader, subnetLoader });
    return;
  }

  if (route.kind === 'subnet') {
    const proposalLoader = createProposalLoader({ queryFacade });
    const subnetLoader = createSubnetLoader({ queryFacade });
    await renderSubnetPage(root, { subnetId: route.subnetId, subnetLoader, proposalLoader });
    return;
  }

  const neuronLoader = createNeuronLoader({ queryFacade });
  await renderNeuronPage(root, { neuronId: route.neuronId, neuronLoader });
}
