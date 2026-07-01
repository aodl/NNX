#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createAgentQueryBackend } from '../../canisters/frontend/web/src/data/query/agent-query-backend.js';
import { createIcQueryFacade } from '../../canisters/frontend/web/src/data/query/ic-query-facade.js';
import {
  createProposalAnalysisService,
  parseProposalIntent,
} from '../../canisters/frontend/web/src/data/proposal-analysis/index.js';
import { classifyVoteReadiness } from '../../canisters/frontend/web/src/data/proposal-analysis/vote-readiness.js';

const DEFAULT_FRONTEND_URL = 'https://6h2pa-qiaaa-aaaao-qp4fa-cai.icp0.io/';
const STAGING_HISTORIAN_ID = 'yo47z-piaaa-aaaac-qg3xa-cai';
const DEFAULT_STATE_FILE = '.nnx-review-state/staging-mainnet.json';
const DEFAULT_OUT = 'review-output/staging-mainnet-review.md';
const DEFAULT_MAX_INITIAL_CHANGED = 3;
const DEFAULT_TERMINAL_SAMPLE_LIMIT = 2;

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`;
  return url;
}

async function readJsonIfExists(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function fetchJson(baseUrl, pathname) {
  const url = new URL(pathname, baseUrl);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`${url.href} returned HTTP ${response.status}`);
  }
  return response.json();
}

async function routeStatus(baseUrl, pathname) {
  const url = new URL(pathname, baseUrl);
  const response = await fetch(url, { method: 'GET', redirect: 'manual' });
  return { path: pathname, status: response.status, ok: response.ok };
}

function proposalIdText(proposal) {
  const id = proposal?.proposalId ?? proposal?.id ?? null;
  return id === null || id === undefined ? null : id.toString();
}

function proposalFingerprint(proposal) {
  const intent = parseProposalIntent(proposal);
  return {
    statusKind: proposal?.statusKind ?? null,
    rewardStatusKind: proposal?.rewardStatusKind ?? null,
    actionKind: intent.actionKind,
    actionHash: JSON.stringify({
      actionTypeName: proposal?.actionTypeName ?? null,
      actionValues: proposal?.actionValues ?? [],
      payloadSearchText: proposal?.payloadSearchText ?? proposal?.summary ?? null,
    }),
  };
}

function changedOpenProposals(openProposals, previousState, { maxInitialChanged } = {}) {
  const previous = previousState?.openProposalFingerprints ?? {};
  const changed = openProposals.filter((proposal) => {
    const id = proposalIdText(proposal);
    if (!id) return false;
    return JSON.stringify(previous[id] ?? null) !== JSON.stringify(proposalFingerprint(proposal));
  });
  if (!previousState && Number.isFinite(maxInitialChanged)) {
    return changed.slice(0, maxInitialChanged);
  }
  return changed;
}

function issueTexts(issues, severity) {
  return issues
    .filter((issue) => issue.severity === severity)
    .map((issue) => `${issue.code}: ${issue.title}`);
}

function recommendationFor(analysis, voteReadiness) {
  if (voteReadiness === 'misleading') return 'fix lifecycle';
  if (voteReadiness === 'bug_suspected') return 'fix analyzer';
  if (voteReadiness === 'unsupported') return 'add fixture';
  if (analysis.confidence === 'low') return 'fix parser';
  if ((analysis.dataWarnings ?? []).length > 0 || analysis.summary.manualReviewCount > 0) {
    return 'improve copy';
  }
  return 'none';
}

function reportProposal({ proposal, analysis, source }) {
  const voteReadiness = classifyVoteReadiness(analysis);
  return {
    source,
    proposalId: proposalIdText(proposal),
    title: proposal?.title ?? proposal?.summary ?? '',
    url: `https://nns.ic0.app/proposal/?proposal=${proposalIdText(proposal)}`,
    statusKind: proposal?.statusKind ?? null,
    rewardStatusKind: proposal?.rewardStatusKind ?? null,
    topicLabel: proposal?.topicLabel ?? null,
    actionTypeName: proposal?.actionTypeName ?? null,
    nnsFunctionId: proposal?.nnsFunctionId ?? null,
    nnsFunctionName: proposal?.nnsFunctionName ?? null,
    lifecycle: analysis.lifecycle,
    actionKind: analysis.actionKind,
    parserConfidence: analysis.confidence,
    issueSummary: analysis.summary,
    criticalIssues: issueTexts(analysis.issues, 'critical'),
    warnings: issueTexts(analysis.issues, 'warning'),
    manualReviewItems: issueTexts(analysis.issues, 'manual_review'),
    infoItems: issueTexts(analysis.issues, 'info'),
    dataWarnings: (analysis.dataWarnings ?? []).map((warning) => warning.message ?? String(warning)),
    voteReadiness,
    engineeringRecommendation: recommendationFor(analysis, voteReadiness),
    rationale: `${analysis.lifecycle}; ${analysis.actionKind}; confidence ${analysis.confidence}`,
  };
}

function recommendedAnalyzerFamily({ actionTypeName, topicLabel }) {
  const text = `${actionTypeName ?? ''} ${topicLabel ?? ''}`.toLowerCase();
  if (/api boundary/.test(text)) return 'API-boundary';
  if (/guestos|hostos|ssh|subnet operational|split subnet|delete subnet|version/.test(text)) return 'OS/node-admin';
  if (/node|subnet/.test(text)) return 'node/subnet';
  if (/governance|followee|neuron/.test(text)) return 'governance';
  if (/sns/.test(text)) return 'SNS';
  if (/econom/.test(text)) return 'economics';
  if (/canister/.test(text)) return 'canister';
  return 'other';
}

function unsupportedActionGroupsFromReports(proposals) {
  const groups = new Map();
  for (const proposal of proposals.filter((item) => item.voteReadiness === 'unsupported')) {
    const key = [
      proposal.actionTypeName ?? proposal.actionKind,
      proposal.topicLabel ?? '',
      proposal.nnsFunctionId ?? '',
      proposal.nnsFunctionName ?? '',
    ].join('|');
    const group = groups.get(key) ?? {
      actionTypeName: proposal.actionTypeName ?? proposal.actionKind,
      nnsFunctionId: proposal.nnsFunctionId ?? null,
      nnsFunctionName: proposal.nnsFunctionName ?? null,
      topicLabel: proposal.topicLabel ?? null,
      openCount: 0,
      exampleProposalIds: [],
      recommendedAnalyzerFamily: recommendedAnalyzerFamily(proposal),
    };
    if (proposal.source === 'changed_open') group.openCount += 1;
    if (group.exampleProposalIds.length < 5) group.exampleProposalIds.push(proposal.proposalId);
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => {
    if (right.openCount !== left.openCount) return right.openCount - left.openCount;
    return left.actionTypeName.localeCompare(right.actionTypeName);
  });
}

async function sampleRecentTerminalProposals({ queryFacade, openProposals, limit = DEFAULT_TERMINAL_SAMPLE_LIMIT }) {
  const maxOpenId = openProposals
    .map((proposal) => BigInt(proposalIdText(proposal) ?? 0))
    .reduce((max, id) => (id > max ? id : max), 0n);
  const start = maxOpenId > 0n ? maxOpenId : 150000n;
  const samples = [];
  for (let offset = 0n; offset < 30n && samples.length < limit; offset += 1n) {
    const proposalId = start - offset;
    if (proposalId <= 0n) break;
    const proposal = await queryFacade.getNnsProposal({ proposalId }).catch(() => null);
    if (!proposal) continue;
    const intent = parseProposalIntent(proposal);
    if (intent.actionKind === 'Unsupported') continue;
    if (!['executed', 'failed', 'rejected'].includes(proposal.statusKind)) continue;
    samples.push(proposal);
  }
  return samples;
}

function markdownReport({ frontendUrl, buildInfo, frontendEnv, routes, proposals, unsupportedActionGroups }) {
  const lines = [
    '# NNX deployed mainnet review',
    '',
    `Frontend: ${frontendUrl}`,
    `Build commit: ${buildInfo.gitCommit ?? 'unknown'}`,
    `Environment: ${buildInfo.environment ?? 'unknown'}`,
    `Historian: ${frontendEnv['PUBLIC_CANISTER_ID:nnx_historian'] ?? 'missing'}`,
    '',
    '## Route sanity',
    '',
    '| Route | Status |',
    '| --- | --- |',
    ...routes.map((route) => `| \`${route.path}\` | ${route.status} |`),
    '',
    '## Proposal review',
    '',
  ];

  if (proposals.length === 0) {
    lines.push('No new or changed proposals were detected.');
  } else {
    for (const proposal of proposals) {
      lines.push(
        `### Proposal ${proposal.proposalId}`,
        '',
        `- Source: ${proposal.source}`,
        `- Status: ${proposal.statusKind} / ${proposal.rewardStatusKind}`,
        `- Lifecycle: ${proposal.lifecycle}`,
        `- Action: ${proposal.actionKind}`,
        `- Parser confidence: ${proposal.parserConfidence}`,
        `- Vote readiness: ${proposal.voteReadiness}`,
        `- Engineering recommendation: ${proposal.engineeringRecommendation}`,
        `- Rationale: ${proposal.rationale}`,
        '',
      );
      for (const [label, values] of [
        ['Critical', proposal.criticalIssues],
        ['Warnings', proposal.warnings],
        ['Manual review', proposal.manualReviewItems],
        ['Info', proposal.infoItems],
        ['Data warnings', proposal.dataWarnings],
      ]) {
        if (values.length === 0) continue;
        lines.push(`${label}:`);
        for (const value of values) lines.push(`- ${value}`);
        lines.push('');
      }
    }
  }
  lines.push('', '## Unsupported action groups', '');
  if (unsupportedActionGroups.length === 0) {
    lines.push('No unsupported action groups in reviewed proposals.');
  } else {
    for (const group of unsupportedActionGroups) {
      lines.push(`- ${group.actionTypeName}: ${group.openCount} open; topic ${group.topicLabel ?? 'unknown'}; function ${group.nnsFunctionName ?? group.nnsFunctionId ?? 'unknown'}; examples ${group.exampleProposalIds.join(', ')}; recommended family ${group.recommendedAnalyzerFamily}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

const frontendUrl = normalizeBaseUrl(argValue('--frontend-url', DEFAULT_FRONTEND_URL));
const stateFile = argValue('--state-file', DEFAULT_STATE_FILE);
const outFile = argValue('--out', DEFAULT_OUT);
const maxInitialChanged = Number.parseInt(
  argValue('--max-initial-changed', String(DEFAULT_MAX_INITIAL_CHANGED)),
  10,
);
const terminalSampleLimit = Number.parseInt(
  argValue('--terminal-sample-limit', String(DEFAULT_TERMINAL_SAMPLE_LIMIT)),
  10,
);
const jsonOutFile = outFile.replace(/\.md$/i, '.json');

const [buildInfo, frontendEnv, previousState] = await Promise.all([
  fetchJson(frontendUrl, '/generated/build-info.json'),
  fetchJson(frontendUrl, '/generated/frontend-env.json'),
  readJsonIfExists(stateFile),
]);

if (frontendEnv['PUBLIC_CANISTER_ID:nnx_historian'] !== STAGING_HISTORIAN_ID) {
  throw new Error(`Deployed historian mismatch: expected ${STAGING_HISTORIAN_ID}`);
}

const routes = await Promise.all([
  '/',
  '/proposal/1',
  '/proposal/not-a-number',
  '/neuron/not-a-number',
  '/subnet/not-a-principal',
  '/review',
  '/review/extra',
  '/data-sources',
  '/data-sources/extra',
].map((route) => routeStatus(frontendUrl, route)));

const backend = await createAgentQueryBackend({
  host: 'https://icp0.io',
  local: false,
  historianCanisterId: STAGING_HISTORIAN_ID,
});
const queryFacade = createIcQueryFacade({ backend });
const analysisService = createProposalAnalysisService({ queryFacade });
const openProposals = await queryFacade.getOpenNnsProposals();
const changed = changedOpenProposals(openProposals, previousState, { maxInitialChanged });
const terminalSamples = await sampleRecentTerminalProposals({
  queryFacade,
  openProposals,
  limit: terminalSampleLimit,
});

const proposals = [];
for (const proposal of changed) {
  const analysis = await analysisService.analyzeProposalObject({ proposal, openProposals, mode: 'full' });
  proposals.push(reportProposal({ proposal, analysis, source: 'changed_open' }));
}
for (const proposal of terminalSamples) {
  const analysis = await analysisService.analyzeProposalObject({ proposal, openProposals, mode: 'full' });
  proposals.push(reportProposal({ proposal, analysis, source: 'recent_terminal_sample' }));
}

const nextState = {
  reviewedAt: new Date().toISOString(),
  buildInfo,
  openProposalFingerprints: Object.fromEntries(
    openProposals.map((proposal) => [proposalIdText(proposal), proposalFingerprint(proposal)]),
  ),
};

const jsonReport = {
  reviewedAt: nextState.reviewedAt,
  frontendUrl: frontendUrl.href,
  buildInfo,
  frontendEnv,
  routes,
  openProposalCount: openProposals.length,
  changedOpenProposalCount: changed.length,
  terminalSampleCount: terminalSamples.length,
  proposals,
  unsupportedActionGroups: unsupportedActionGroupsFromReports(proposals),
};

await mkdir(path.dirname(stateFile), { recursive: true });
await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(stateFile, `${JSON.stringify(nextState, null, 2)}\n`);
await writeFile(jsonOutFile, `${JSON.stringify(jsonReport, null, 2)}\n`);
await writeFile(outFile, markdownReport({
  frontendUrl: frontendUrl.href,
  buildInfo,
  frontendEnv,
  routes,
  proposals,
  unsupportedActionGroups: jsonReport.unsupportedActionGroups,
}));

console.log(`Review written to ${outFile}`);
console.log(`JSON written to ${jsonOutFile}`);
console.log(`Changed open proposals: ${changed.length}`);
console.log(`Recent terminal samples: ${terminalSamples.length}`);
console.log(`Vote readiness: ${proposals.map((proposal) => proposal.voteReadiness).join(', ') || 'none'}`);
