import { parseRoute } from './router.js';
import { createAgentQueryBackend } from '../data/query/agent-query-backend.js';
import { createIcQueryFacade } from '../data/query/ic-query-facade.js';
import { createProposalAnalysisService } from '../data/proposal-analysis/index.js';
import { createNeuronLoader } from '../data/neuron-loader.js';
import { createProposalLoader } from '../data/proposal-loader.js';
import { createSubnetLoader } from '../data/subnet-loader.js';
import { renderHomePage } from '../ui/home-page.js';
import { renderNeuronPage } from '../ui/neuron-page.js';
import { renderNotFoundPage } from '../ui/not-found-page.js';
import { renderProposalPage } from '../ui/proposal-page.js';
import { renderSubnetPage } from '../ui/subnet-page.js';

async function createQueryFacade(windowRef) {
  // Test harness only: Playwright injects a normalized query facade before app
  // bootstrap so browser tests can run without mainnet or local replica access.
  // Production pages do not define this property and use the IC query backend.
  if (windowRef.__NNX_TEST_QUERY_FACADE__) {
    return windowRef.__NNX_TEST_QUERY_FACADE__;
  }
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
  const analysisService = createProposalAnalysisService({ queryFacade });
  const analysisFacade = Object.freeze({
    ...queryFacade,
    analyzeProposal: analysisService.analyzeProposal,
    analyzeProposalObject: analysisService.analyzeProposalObject,
    analyzeOpenProposals: analysisService.analyzeOpenProposals,
    analyzeSubnetProposals: analysisService.analyzeSubnetProposals,
  });

  if (route.kind === 'home') {
    const proposalLoader = createProposalLoader({ queryFacade: analysisFacade });
    const subnetLoader = createSubnetLoader({ queryFacade });
    await renderHomePage(root, { proposalLoader, subnetLoader });
    return;
  }

  if (route.kind === 'proposal') {
    const proposalLoader = createProposalLoader({ queryFacade: analysisFacade });
    const subnetLoader = createSubnetLoader({ queryFacade });
    await renderProposalPage(root, { proposalId: route.proposalId, proposalLoader, subnetLoader });
    return;
  }

  if (route.kind === 'subnet') {
    const proposalLoader = createProposalLoader({ queryFacade: analysisFacade });
    const subnetLoader = createSubnetLoader({ queryFacade });
    await renderSubnetPage(root, { subnetId: route.subnetId, subnetLoader, proposalLoader });
    return;
  }

  const neuronLoader = createNeuronLoader({ queryFacade });
  await renderNeuronPage(root, { neuronId: route.neuronId, neuronLoader });
}
