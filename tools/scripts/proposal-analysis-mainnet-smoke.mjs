import assert from 'node:assert/strict';
import { createAgentQueryBackend } from '../../canisters/frontend/web/src/data/query/agent-query-backend.js';
import { createIcQueryFacade } from '../../canisters/frontend/web/src/data/query/ic-query-facade.js';
import { createProposalAnalysisService } from '../../canisters/frontend/web/src/data/proposal-analysis/index.js';
import { PROPOSAL_ISSUE_CODES } from '../../canisters/frontend/web/src/data/proposal-analysis/issue-codes.js';

const REPORT_LIMIT = Number.parseInt(process.env.NNX_SMOKE_REPORT_LIMIT ?? '5', 10);

function issueCount(analysis) {
  return analysis.issues.length;
}

const backend = await createAgentQueryBackend({ host: 'https://icp0.io', local: false });
const queryFacade = createIcQueryFacade({ backend });
const analysisService = createProposalAnalysisService({ queryFacade });

const analyses = await analysisService.analyzeOpenProposals();
assert.ok(Array.isArray(analyses), 'analyzeOpenProposals() must return an array');

const unsupported = await analysisService.analyzeProposalObject({
  proposal: {
    id: 0n,
    statusKind: 'Open',
    actionTypeName: 'BlessReplicaVersion',
  },
  openProposals: [],
});
assert.ok(
  unsupported.issues.some((issue) => issue.code === PROPOSAL_ISSUE_CODES.UNSUPPORTED_PROPOSAL_ANALYSIS),
  'Unsupported action types must produce UNSUPPORTED_PROPOSAL_ANALYSIS',
);

console.log(`proposal-analysis mainnet smoke: analyzed ${analyses.length} open proposals`);
for (const analysis of analyses.slice(0, REPORT_LIMIT)) {
  console.log(JSON.stringify({
    proposalId: analysis.proposalId?.toString() ?? null,
    actionKind: analysis.actionKind,
    lifecycle: analysis.lifecycle,
    issueCount: issueCount(analysis),
    summary: analysis.summary,
  }));
}
console.log(JSON.stringify({
  unsupportedActionKind: unsupported.actionKind,
  unsupportedLifecycle: unsupported.lifecycle,
  unsupportedIssueCodes: unsupported.issues.map((issue) => issue.code),
}));
