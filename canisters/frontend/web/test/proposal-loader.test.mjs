import assert from 'node:assert/strict';
import test from 'node:test';
import { createProposalLoader } from '../src/data/proposal-loader.js';
import { groupProposalsByTopic, summarizeProposalStatuses } from '../src/ui/home-page.js';

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
