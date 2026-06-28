import assert from 'node:assert/strict';
import test from 'node:test';
import { createProposalLoader } from '../src/data/proposal-loader.js';
import {
  annotateSubnetsWithProposalImpacts,
  capitalizeFirstLetter,
  countAffectedProposalsForSubnet,
  formatSubnetType,
  groupProposalsByTopic,
  summarizeProposalStatuses,
  summarizeSubnetKinds,
} from '../src/ui/home-page.js';

test('loads open proposals newest first', async () => {
  const proposalLoader = createProposalLoader({
    queryFacade: {
      getOpenNnsProposals: async () => [
        { id: 3n, createdAtSeconds: 30n },
        { id: 1n, createdAtSeconds: 10n },
        { id: 2n, createdAtSeconds: 30n },
      ],
    },
  });

  const proposals = await proposalLoader.loadOpenProposals();

  assert.deepEqual(proposals.map((proposal) => proposal.id), [2n, 3n, 1n]);
});

test('loads a single proposal by id', async () => {
  const proposalLoader = createProposalLoader({
    queryFacade: {
      getNnsProposal: async ({ proposalId }) => ({ id: proposalId }),
    },
  });

  const proposal = await proposalLoader.loadProposal(123n);

  assert.deepEqual(proposal, { id: 123n });
});

test('groups proposals by topic in current order', () => {
  const groups = groupProposalsByTopic([
    { id: 1n, topicLabel: 'Governance' },
    { id: 2n, topicLabel: 'Node Admin' },
    { id: 3n, topicLabel: 'Governance' },
  ]);

  assert.deepEqual(groups.map((group) => group.topicLabel), ['Governance', 'Node Admin']);
  assert.deepEqual(groups[0].proposals.map((proposal) => proposal.id), [1n, 3n]);
});

test('summarizes proposal statuses for group headers', () => {
  const counts = summarizeProposalStatuses([
    { statusKind: 'open' },
    { statusKind: 'open' },
    { statusKind: 'executed' },
    { statusKind: 'failed' },
    { statusKind: 'adopted' },
  ]);

  assert.deepEqual(counts, { open: 2, executed: 1, failed: 1 });
});

test('summarizes subnet kinds for group headers', () => {
  const summary = summarizeSubnetKinds([
    { id: 'subnet-1', cmcLabel: 'sns', visibility: 'public', type: 'application' },
    { id: 'subnet-2', cmcLabel: 'NNS', visibility: 'private', type: 'system' },
    { id: 'subnet-3', cmcLabel: null, visibility: 'private', type: 'cloud_engine' },
    { id: 'subnet-4', cmcLabel: null, visibility: 'public', type: 'verified_application' },
    { id: 'subnet-5', cmcLabel: null, visibility: 'public', type: 'application' },
    { id: 'subnet-6', cmcLabel: null, visibility: 'public', type: 'unknown' },
  ]);

  assert.deepEqual(summary, [
    { kind: 'special', label: 'NNS', count: 1 },
    { kind: 'special', label: 'Sns', count: 1 },
    { kind: 'cloud-engine', label: 'Cloud Engine', count: 1 },
    { kind: 'verified-application', label: 'Verified Application', count: 1 },
    { kind: 'application', label: 'Application', count: 2 },
    { kind: 'public', label: 'Permissionless', count: 4 },
  ]);
});

test('capitalizes the first letter of display labels', () => {
  assert.equal(capitalizeFirstLetter('fiduciary'), 'Fiduciary');
  assert.equal(capitalizeFirstLetter('SNS'), 'SNS');
  assert.equal(capitalizeFirstLetter(''), '');
});

test('formats subnet type labels for display', () => {
  assert.equal(formatSubnetType('application'), 'Application');
  assert.equal(formatSubnetType('cloud_engine'), 'Cloud Engine');
  assert.equal(formatSubnetType(null), 'Unknown');
});

test('counts accepting-votes proposals that mention a subnet id in the payload', () => {
  const subnetId = 'tdb26-jop6k-aogll-7ltgs-eruif-6kk7m-qpktf-gdiqx-mxtrf-vb5e6-eqe';

  assert.equal(countAffectedProposalsForSubnet(subnetId, [
    { id: 1n, payloadSearchText: `Update subnet ${subnetId}` },
    { id: 2n, actionValues: [{ name: 'subnet_id', value: subnetId }] },
    { id: 3n, payloadSearchText: 'No subnet here' },
  ]), 2);
});

test('annotates subnets and groups with unique affected proposal counts', () => {
  const subnetA = 'subnet-a';
  const subnetB = 'subnet-b';
  const annotated = annotateSubnetsWithProposalImpacts({
    subnets: [{ id: subnetA }, { id: subnetB }],
    groups: [{
      nodeCount: 13,
      subnets: [{ id: subnetA }, { id: subnetB }],
    }],
  }, [
    { id: 1n, payloadSearchText: `Touches ${subnetA} and ${subnetB}` },
    { id: 2n, payloadSearchText: `Touches ${subnetB}` },
  ]);

  assert.deepEqual(
    annotated.subnets.map((subnet) => subnet.affectedProposalCount),
    [1, 2],
  );
  assert.equal(annotated.groups[0].affectedProposalCount, 2);
});
