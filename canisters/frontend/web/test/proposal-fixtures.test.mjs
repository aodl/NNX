import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { parseProposalIntent } from '../src/data/proposal-analysis/proposal-action-parser.js';
import { createProposalAnalysisService } from '../src/data/proposal-analysis/index.js';
import { PROPOSAL_ISSUE_CODES } from '../src/data/proposal-analysis/issue-codes.js';
import { proposalLifecycle } from '../src/data/proposal-analysis/proposal-analysis-types.js';
import { safeExternalUrl } from '../src/security/safe-url.js';

const fixtureRoot = path.resolve(
  'canisters/frontend/web/test/fixtures/proposals/mainnet',
);

async function loadFixtures() {
  const fixtures = [];
  for (const corpus of ['supported', 'unsupported', 'historical']) {
    const dir = path.join(fixtureRoot, corpus);
    for (const file of await readdir(dir)) {
      if (!file.endsWith('.json')) continue;
      const fixture = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
      fixtures.push({ corpus, file, fixture });
    }
  }
  return fixtures.sort((left, right) => left.fixture.proposalId.localeCompare(right.fixture.proposalId));
}

function proposalFromFixture(fixture) {
  return {
    id: BigInt(fixture.proposalId),
    proposalId: BigInt(fixture.proposalId),
    topicId: fixture.topicId,
    topicLabel: fixture.topicLabel,
    status: fixture.status,
    statusKind: fixture.statusKind,
    statusLabel: fixture.statusLabel,
    rewardStatus: fixture.rewardStatus,
    rewardStatusKind: fixture.rewardStatusKind,
    rewardStatusLabel: fixture.rewardStatusLabel,
    actionTypeName: fixture.actionTypeName,
    actionDescription: fixture.actionDescription,
    actionDetails: fixture.actionDetails,
    actionValues: fixture.actionValues,
    payloadSearchText: fixture.payloadSummary,
    summary: fixture.payloadSummary,
    title: `${fixture.actionTypeName} fixture ${fixture.proposalId}`,
    url: 'javascript:alert(1)',
  };
}

function nodeLocation(nodeId) {
  return {
    nodeId,
    nodeProviderId: `provider-${nodeId}`,
    nodeOperatorId: `operator-${nodeId}`,
    dataCenterId: `dc-${nodeId}`,
    dataCenterOwner: 'fixture-owner',
    dataCenterRegion: 'US, NY',
    gps: { latitude: 40, longitude: -74 },
    domain: `${nodeId}.example.com`,
    publicIpv4: { ipAddr: '203.0.113.10' },
  };
}

function queryFacade() {
  return {
    getOpenNnsProposals: async () => [],
    getIcSubnets: async () => ({ subnets: [], warnings: [] }),
    getIcTopology: async () => ({}),
    getCmcSubnetLabels: async () => ({ labelsBySubnetId: {}, publicSubnetIds: [], warnings: [] }),
    getIcNodeDetails: async ({ nodeIds }) => ({
      nodeLocations: (nodeIds ?? []).map(nodeLocation),
      warnings: [],
    }),
    getApiBoundaryNodeIds: async () => ({
      available: true,
      nodeIds: [],
      apiBoundaryNodeIds: [],
      errors: [],
      warnings: [],
    }),
    getNodeMetricsHistory: async () => ({
      records: [],
      partial: false,
      errors: [],
    }),
  };
}

test('mainnet proposal fixtures match stored parser golden output', async () => {
  const fixtures = await loadFixtures();
  assert.ok(fixtures.length >= 6);

  for (const { fixture } of fixtures) {
    assert.equal(fixture.source, 'NNS Governance via NNX query facade');
    assert.ok(fixture.capturedAt);
    const proposal = proposalFromFixture(fixture);
    const intent = parseProposalIntent(proposal);
    assert.equal(intent.actionKind, fixture.parsedIntent.actionKind, fixture.proposalId);
    assert.equal(intent.confidence, fixture.parsedIntent.confidence, fixture.proposalId);
    assert.deepEqual(intent.parseWarnings, fixture.parsedIntent.parseWarnings, fixture.proposalId);
    assert.deepEqual(intent.addNodeIds, fixture.parsedIntent.addNodeIds, fixture.proposalId);
    assert.deepEqual(intent.removeNodeIds, fixture.parsedIntent.removeNodeIds, fixture.proposalId);
    assert.deepEqual(intent.referencedSubnetIds, fixture.parsedIntent.referencedSubnetIds, fixture.proposalId);
  }
});

test('mainnet proposal fixtures analyze without crashing', async () => {
  const analysisService = createProposalAnalysisService({ queryFacade: queryFacade() });
  for (const { corpus, fixture } of await loadFixtures()) {
    const proposal = proposalFromFixture(fixture);
    const analysis = await analysisService.analyzeProposalObject({ proposal, mode: 'full' });
    assert.equal(analysis.lifecycle, proposalLifecycle(proposal), fixture.proposalId);
    assert.equal(typeof analysis.summary.infoCount, 'number');
    if (corpus === 'unsupported' || fixture.parsedIntent.actionKind === 'Unsupported') {
      assert.ok(
        analysis.issues.some((issue) => issue.code === PROPOSAL_ISSUE_CODES.UNSUPPORTED_PROPOSAL_ANALYSIS),
        fixture.proposalId,
      );
    }
  }
});

test('proposal lifecycle status wins over accepting-votes reward status', () => {
  assert.equal(proposalLifecycle({ statusKind: 'executed', rewardStatusKind: 'accepting-votes' }), 'post_execution_success');
  assert.equal(proposalLifecycle({ statusKind: 'failed', rewardStatusKind: 'accepting-votes' }), 'post_execution_failed');
  assert.equal(proposalLifecycle({ statusKind: 'rejected', rewardStatusKind: 'accepting-votes' }), 'rejected');
  assert.equal(proposalLifecycle({ statusKind: 'adopted', rewardStatusKind: 'accepting-votes' }), 'pre_execution');
  assert.equal(proposalLifecycle({ statusKind: 'open', rewardStatusKind: 'accepting-votes' }), 'pre_execution');
  assert.equal(proposalLifecycle({ rewardStatusKind: 'accepting-votes' }), 'pre_execution');
  assert.equal(proposalLifecycle({ status: 4, rewardStatusKind: 'accepting-votes' }), 'post_execution_success');
  assert.equal(proposalLifecycle({ status: 5, rewardStatusKind: 'accepting-votes' }), 'post_execution_failed');
  assert.equal(proposalLifecycle({ status: 2, rewardStatusKind: 'accepting-votes' }), 'rejected');
});

test('executed accepting-votes remove-node fixture uses postcondition analysis only', async () => {
  const fixture = (await loadFixtures())
    .map((entry) => entry.fixture)
    .find((entry) => entry.proposalId === '142595');
  assert.ok(fixture);
  const proposal = proposalFromFixture({
    ...fixture,
    actionTypeName: 'RemoveNodesFromSubnet',
    actionValues: fixture.actionValues.filter((entry) => entry.name === 'node_ids_remove' || entry.name === 'subnet_id'),
    parsedIntent: {
      ...fixture.parsedIntent,
      actionKind: 'RemoveNodesFromSubnet',
      addNodeIds: [],
    },
  });
  const analysisService = createProposalAnalysisService({ queryFacade: queryFacade() });
  const analysis = await analysisService.analyzeProposalObject({ proposal, mode: 'full' });

  assert.equal(analysis.lifecycle, 'post_execution_success');
  assert.equal(
    analysis.issues.some((issue) => issue.code === PROPOSAL_ISSUE_CODES.REMOVE_NODE_ALREADY_UNASSIGNED),
    false,
  );
  assert.equal(
    analysis.issues.every((issue) => issue.lifecycle !== 'pre_execution'),
    true,
  );
});

test('fixture-backed proposal URLs still require safe URL rendering', async () => {
  for (const { fixture } of await loadFixtures()) {
    const proposal = proposalFromFixture(fixture);
    assert.equal(safeExternalUrl(proposal.url), null, fixture.proposalId);
  }
});
