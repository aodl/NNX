import { apiBoundaryNodeAnalyzer } from './analyzers/api-boundary-node-analyzer.js';
import { createSubnetAnalyzer } from './analyzers/create-subnet-analyzer.js';
import { dfinityProviderAnalyzer } from './analyzers/dfinity-provider-analyzer.js';
import { diversityAnalyzer } from './analyzers/diversity-analyzer.js';
import { nodeConflictAnalyzer } from './analyzers/node-conflict-analyzer.js';
import { removeNodesFromSubnetAnalyzer } from './analyzers/remove-nodes-from-subnet-analyzer.js';
import { subnetMembershipAnalyzer } from './analyzers/subnet-membership-analyzer.js';
import { unsupportedActionAnalyzer } from './analyzers/unsupported-action-analyzer.js';
import { parseProposalIntent } from './proposal-action-parser.js';
import {
  loadProposalAnalysisBaseContext,
  loadProposalAnalysisContext,
} from './proposal-analysis-context.js';
import { proposalLifecycle, summarizeIssues } from './proposal-analysis-types.js';
import { simulateProposalStateChange } from './proposal-state-simulator.js';

export const ANALYZERS = [
  nodeConflictAnalyzer,
  subnetMembershipAnalyzer,
  createSubnetAnalyzer,
  removeNodesFromSubnetAnalyzer,
  apiBoundaryNodeAnalyzer,
  dfinityProviderAnalyzer,
  diversityAnalyzer,
  unsupportedActionAnalyzer,
];

function mergeMetrics(target, source = {}) {
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) target[key] = value;
  }
}

function targetCurrentNodeIds(intent, context) {
  if (intent.createsNewSubnet && !intent.targetSubnetId) return [];
  const targetSubnetId = context.effectiveTargetSubnetId ?? intent.targetSubnetId;
  if (!targetSubnetId) return [];
  return context.subnetsById[targetSubnetId]?.nodeIds ?? [];
}

export function createProposalAnalysisService({ queryFacade }) {
  async function analyzeProposalObject({ proposal, openProposals = null, baseContext = null } = {}) {
    const intent = parseProposalIntent(proposal);
    const lifecycle = proposalLifecycle(proposal);
    const analysisContext = await loadProposalAnalysisContext({
      queryFacade,
      proposal,
      intent,
      openProposals,
      baseContext,
    });
    const currentNodeIds = targetCurrentNodeIds(intent, analysisContext);
    const stateChange = simulateProposalStateChange({
      lifecycle,
      currentNodeIds,
      addNodeIds: intent.addNodeIds,
      removeNodeIds: intent.removeNodeIds,
      createsNewSubnet: intent.createsNewSubnet,
    });
    const openIntents = (analysisContext.openProposals ?? [])
      .map((openProposal) => parseProposalIntent(openProposal));
    const issues = [];
    const dataWarnings = [
      ...intent.parseWarnings.map((message) => ({ message })),
      ...(analysisContext.warnings ?? []),
    ];
    const metrics = {
      diversity: null,
      concentration: null,
      distance: null,
      dfinityProvider: null,
    };
    const analyzerContext = {
      proposal,
      intent,
      lifecycle,
      stateChange,
      analysisContext,
      openIntents,
    };

    for (const analyzer of ANALYZERS) {
      if (!analyzer.supports(intent)) continue;
      const result = analyzer.analyze(analyzerContext) ?? {};
      issues.push(...(result.issues ?? []));
      dataWarnings.push(...(result.dataWarnings ?? []));
      mergeMetrics(metrics, result.metrics);
    }

    return {
      proposalId: intent.proposalId,
      actionKind: intent.actionKind,
      lifecycle,
      confidence: intent.confidence,
      summary: summarizeIssues(issues),
      intent,
      stateChange,
      issues,
      metrics,
      dataWarnings,
    };
  }

  async function analyzeProposal({ proposalId } = {}) {
    const proposal = await queryFacade.getNnsProposal({ proposalId });
    if (!proposal) return null;
    return analyzeProposalObject({ proposal });
  }

  async function analyzeOpenProposals() {
    const openProposals = await queryFacade.getOpenNnsProposals();
    const baseContext = await loadProposalAnalysisBaseContext({ queryFacade, openProposals });
    const analyses = [];
    for (const proposal of openProposals) {
      analyses.push(await analyzeProposalObject({ proposal, openProposals, baseContext }));
    }
    return analyses;
  }

  async function analyzeSubnetProposals({ subnetId } = {}) {
    const [analyses, subnetDetail] = await Promise.all([
      analyzeOpenProposals(),
      queryFacade.getIcSubnetDetails({ subnetId }).catch(() => ({ subnet: null })),
    ]);
    const subnetNodeIds = new Set(subnetDetail?.subnet?.nodeIds ?? []);
    return analyses.filter((analysis) => (
      analysis.intent.targetSubnetId === subnetId
      || analysis.intent.referencedSubnetIds.includes(subnetId)
      || analysis.intent.allNodeIds.some((nodeId) => subnetNodeIds.has(nodeId))
    ));
  }

  return Object.freeze({
    analyzeProposal,
    analyzeProposalObject,
    analyzeOpenProposals,
    analyzeSubnetProposals,
  });
}
