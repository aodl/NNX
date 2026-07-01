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
import { renderReviewPage } from '../ui/review-page.js';
import { renderSubnetPage } from '../ui/subnet-page.js';
import { renderDataSourcesPage } from '../ui/data-sources-page.js';
import { renderTokenomicsPage } from '../ui/tokenomics-page.js';
import { renderAppShell } from '../ui/app-shell.js';
import { initializeTheme } from '../ui/theme.js';
import { createTokenomicsService } from '../data/tokenomics/tokenomics-service.js';

async function createQueryFacade(windowRef) {
  const hostname = windowRef.location.hostname;
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  const host = local ? windowRef.location.origin : 'https://icp0.io';
  const queryBackend = await createAgentQueryBackend({ host, local });
  return createIcQueryFacade({ backend: queryBackend });
}

export async function bootstrap({ windowRef = window, documentRef = document } = {}) {
  initializeTheme({ documentRef });
  const root = documentRef.getElementById('app');
  if (!root) throw new Error('Missing #app root element');

  const route = parseRoute(windowRef.location.pathname);
  if (route.kind === 'not_found') {
    renderNotFoundPage(root);
    return;
  }

  const queryFacade = await createQueryFacade(windowRef);
  const contentRoot = renderAppShell(root, { route, windowRef, documentRef });
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
    const tokenomicsService = createTokenomicsService({ queryFacade });
    await renderHomePage(contentRoot, { proposalLoader, subnetLoader, tokenomicsService });
    return;
  }

  if (route.kind === 'proposal') {
    const proposalLoader = createProposalLoader({ queryFacade: analysisFacade });
    const subnetLoader = createSubnetLoader({ queryFacade });
    await renderProposalPage(contentRoot, { proposalId: route.proposalId, proposalLoader, subnetLoader });
    return;
  }

  if (route.kind === 'review') {
    const proposalLoader = createProposalLoader({ queryFacade: analysisFacade });
    await renderReviewPage(contentRoot, { proposalLoader });
    return;
  }

  if (route.kind === 'data_sources') {
    await renderDataSourcesPage(contentRoot);
    return;
  }

  if (route.kind === 'tokenomics') {
    const tokenomicsService = createTokenomicsService({ queryFacade });
    await renderTokenomicsPage(contentRoot, { tokenomicsService });
    return;
  }

  if (route.kind === 'subnet') {
    const proposalLoader = createProposalLoader({ queryFacade: analysisFacade });
    const subnetLoader = createSubnetLoader({ queryFacade });
    await renderSubnetPage(contentRoot, { subnetId: route.subnetId, subnetLoader, proposalLoader });
    return;
  }

  const neuronLoader = createNeuronLoader({ queryFacade });
  await renderNeuronPage(contentRoot, { neuronId: route.neuronId, neuronLoader });
}
