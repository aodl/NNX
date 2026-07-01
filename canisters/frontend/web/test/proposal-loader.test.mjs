import assert from 'node:assert/strict';
import test from 'node:test';
import { Principal } from '@icp-sdk/core/principal';
import { createProposalLoader } from '../src/data/proposal-loader.js';
import {
  mergeNodeLocationsByNodeId,
  referencedNodeCandidatesForProposal,
} from '../src/data/proposal-node-impacts.js';
import {
  annotateSubnetsWithProposalImpacts,
  countAffectedProposalsForSubnet,
  referencedSubnetsForProposal,
} from '../src/data/proposal-subnet-impacts.js';
import {
  summarizeSubnetKinds,
} from '../src/ui/home-page.js';
import {
  groupProposalsByStatus,
  groupProposalsByTopic,
  summarizeProposalStatuses,
} from '../src/ui/proposal-list-panel.js';
import {
  capitalizeFirstLetter,
  formatSubnetType,
} from '../src/ui/subnet-formatters.js';

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

test('groups proposals by execution state before topic subgrouping', () => {
  const groups = groupProposalsByStatus([
    { id: 1n, statusKind: 'executed', statusLabel: 'Executed', topicLabel: 'Governance' },
    { id: 2n, statusKind: 'open', statusLabel: 'Open', topicLabel: 'Node Admin' },
    { id: 3n, statusKind: 'failed', statusLabel: 'Failed', topicLabel: 'Governance' },
    { id: 4n, statusKind: 'executed', statusLabel: 'Executed', topicLabel: 'Node Admin' },
  ]);

  assert.deepEqual(groups.map((group) => group.statusLabel), ['Open', 'Executed', 'Failed']);
  assert.deepEqual(groups.map((group) => group.proposals.map((proposal) => proposal.id)), [
    [2n],
    [1n, 4n],
    [3n],
  ]);
  assert.deepEqual(
    groupProposalsByTopic(groups[1].proposals).map((group) => group.topicLabel),
    ['Governance', 'Node Admin'],
  );
});

test('summarizes proposal statuses for group headers', () => {
  const counts = summarizeProposalStatuses([
    { statusKind: 'open' },
    { statusKind: 'open' },
    { statusKind: 'executed' },
    { statusKind: 'failed' },
    { statusKind: 'adopted' },
  ]);

  assert.deepEqual(counts, {
    open: 2,
    adopted: 1,
    executed: 1,
    failed: 1,
    rejected: 0,
    unknown: 0,
  });
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

test('finds known subnets referenced by proposal details', () => {
  const subnetA = 'subnet-a';
  const subnetB = 'subnet-b';

  const subnets = [
    { id: subnetA, nodeCount: 13 },
    { id: subnetB, nodeCount: 34 },
    { id: 'subnet-c', nodeCount: 1 },
  ];

  const referenced = referencedSubnetsForProposal({
    payloadSearchText: `Replace nodes on ${subnetA}`,
    actionValues: [{ name: 'subnet_id', value: subnetB }],
  }, subnets);

  assert.deepEqual(referenced.map((subnet) => subnet.id), [subnetA, subnetB]);
});

test('finds node principals and assigns add remove intent from action value names', () => {
  const nodeToAdd = Principal.fromText('2vxsx-fae').toText();
  const nodeToRemove = Principal.fromText('aaaaa-aa').toText();

  const candidates = referencedNodeCandidatesForProposal({
    actionValues: [
      { name: 'nodes_to_add', value: nodeToAdd },
      { name: 'remove_nodes', value: `Remove ${nodeToRemove}` },
      { name: 'notes', value: 'not-a-principal' },
    ],
  });

  assert.deepEqual(candidates.map(({ nodeId, intent }) => ({ nodeId, intent })), [
    { nodeId: nodeToAdd, intent: 'add' },
    { nodeId: nodeToRemove, intent: 'remove' },
  ]);
});

test('remove intent wins when merging duplicate node locations', () => {
  const nodeId = Principal.fromText('2vxsx-fae').toText();

  const [merged] = mergeNodeLocationsByNodeId([
    [{ nodeId, gps: null, proposalIntent: 'add' }],
    [{ nodeId, gps: { latitude: 1, longitude: 2 }, proposalIntent: 'remove' }],
  ]);

  assert.deepEqual(merged, {
    nodeId,
    gps: { latitude: 1, longitude: 2 },
    proposalIntent: 'remove',
  });
});
