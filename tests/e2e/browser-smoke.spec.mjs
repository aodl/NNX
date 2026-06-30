import { expect, test } from '@playwright/test';

const subnetId = 'w7x7r-cok77-xa';
const nodeA = '2vxsx-fae';
const nodeB = 'uuc56-gyb';
const proposalId = 9001n;
const unsupportedProposalId = 9002n;
const neuronId = 42n;

async function installFixtureFacade(page) {
  await page.addInitScript((fixture) => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const tally = {
      yes: 1_000_000n,
      no: 100_000n,
      total: 2_000_000n,
      yesPercent: 50,
      noPercent: 5,
      uncastPercent: 45,
      votedYesNoTotal: 1_100_000n,
    };
    const nodeLocations = [
      {
        nodeId: fixture.nodeA,
        nodeProviderId: 'provider-a',
        nodeOperatorId: 'operator-a',
        dataCenterId: 'dc-a',
        dataCenterOwner: 'owner-a',
        dataCenterRegion: 'US, NY',
        gps: { latitude: 40.7, longitude: -74 },
        domain: 'node-a.example.com',
        publicIpv4: { ipAddr: '203.0.113.10' },
        httpEndpoint: 'https://node-a.example.com:8080',
        xnetEndpoint: '203.0.113.10:2497',
      },
      {
        nodeId: fixture.nodeB,
        nodeProviderId: 'provider-b',
        nodeOperatorId: 'operator-b',
        dataCenterId: 'dc-b',
        dataCenterOwner: 'owner-b',
        dataCenterRegion: 'DE, HE',
        gps: { latitude: 50.1, longitude: 8.6 },
        domain: 'node-b.example.com',
        publicIpv4: { ipAddr: '203.0.113.11' },
        httpEndpoint: 'https://node-b.example.com:8080',
        xnetEndpoint: '203.0.113.11:2497',
      },
    ];
    const subnet = {
      id: fixture.subnetId,
      nodeIds: [fixture.nodeA, fixture.nodeB],
      nodeCount: 2,
      type: 'application',
      registryTypeLabel: 'Application',
      visibility: 'public',
      visibilityLabel: 'Permissionless',
      replicaVersionId: 'fixture-replica',
      isHalted: false,
    };
    const baseProposal = {
      id: fixture.proposalId,
      title: 'Remove fixture node from subnet',
      url: 'https://forum.dfinity.org/t/fixture-proposal',
      summary: 'Fixture proposal for browser smoke.',
      actionTypeName: 'RemoveNodesFromSubnet',
      actionDescription: 'Remove one node from an existing subnet.',
      actionValues: [
        { name: 'subnet_id', value: fixture.subnetId },
        { name: 'nodes', value: fixture.nodeA },
      ],
      actionDetails: '',
      topicLabel: 'Subnet Management',
      topicId: 1,
      statusKind: 'Open',
      statusLabel: 'Open',
      rewardStatusKind: 'accept_votes',
      rewardStatusLabel: 'Accepting votes',
      proposerNeuronId: fixture.neuronId,
      proposerKnownNeuronName: 'Fixture neuron',
      tally,
      createdAtSeconds: now - 3600n,
      deadlineTimestampSeconds: now + 7200n,
      deadlineProgressPercent: 30,
      deadlineUrgencyLevel: 'medium',
    };
    const unsupportedProposal = {
      ...baseProposal,
      id: fixture.unsupportedProposalId,
      title: 'Unsupported fixture proposal',
      actionTypeName: 'BlessReplicaVersion',
      actionDescription: 'Unsupported action fixture.',
      actionValues: [],
    };
    const proposals = [baseProposal, unsupportedProposal];

    window.__NNX_TEST_QUERY_FACADE__ = {
      getOpenNnsProposals: async () => proposals,
      getNnsProposal: async ({ proposalId }) => (
        proposals.find((proposal) => proposal.id === BigInt(proposalId)) ?? null
      ),
      getNnsNeuron: async ({ neuronId }) => ({
        id: BigInt(neuronId),
        exists: BigInt(neuronId) === fixture.neuronId,
        public: true,
        stakeE8s: 12_000_000_000n,
        controller: 'aaaaa-aa',
        hotkeys: ['aaaaa-aa'],
        hotkeysPrivate: false,
        knownNeuronName: 'Fixture neuron',
        followeesByTopic: {},
      }),
      getNnsNeurons: async ({ neuronIds }) => neuronIds.map((id) => ({
        id: BigInt(id),
        exists: true,
        public: true,
        stakeE8s: 1_000_000_000n,
        controller: 'aaaaa-aa',
        hotkeys: [],
        hotkeysPrivate: false,
        knownNeuronName: null,
        followeesByTopic: {},
      })),
      getIcSubnets: async () => ({ subnets: [subnet], warnings: [] }),
      getIcSubnetDetails: async ({ subnetId }) => ({
        subnet: subnetId === fixture.subnetId ? subnet : null,
        nodeLocations,
        warnings: [],
      }),
      getIcNodeDetails: async ({ nodeIds }) => ({
        nodeLocations: nodeLocations.filter((node) => nodeIds.includes(node.nodeId)),
        warnings: [],
      }),
      getIcTopology: async () => ({}),
      getCmcSubnetLabels: async () => ({
        labelsBySubnetId: {},
        defaultSubnetIds: [fixture.subnetId],
        publicSubnetIds: [fixture.subnetId],
        warnings: [],
      }),
      getNodeMetricsHistory: async () => ({
        subnetId: fixture.subnetId,
        startAtTimestampNanos: 1n,
        endAtTimestampNanos: 2n,
        records: [
          {
            nodeId: fixture.nodeA,
            timestampNanos: 1n,
            numBlocksProposedTotal: 10n,
            numBlockFailuresTotal: 0n,
          },
          {
            nodeId: fixture.nodeA,
            timestampNanos: 2n,
            numBlocksProposedTotal: 30n,
            numBlockFailuresTotal: 0n,
          },
          {
            nodeId: fixture.nodeB,
            timestampNanos: 1n,
            numBlocksProposedTotal: 5n,
            numBlockFailuresTotal: 0n,
          },
        ],
        partial: false,
        errors: [],
      }),
      getApiBoundaryNodeIds: async () => ({
        available: true,
        nodeIds: [],
        apiBoundaryNodeIds: [],
        errors: [],
        warnings: [],
      }),
      clearTopologyCache: () => {},
      refreshIcTopology: async () => ({}),
    };
  }, {
    subnetId,
    nodeA,
    nodeB,
    proposalId,
    unsupportedProposalId,
    neuronId,
  });
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await installFixtureFacade(page);
  page.__nnxConsoleErrors = errors;
});

test.afterEach(async ({ page }) => {
  expect(page.__nnxConsoleErrors).toEqual([]);
});

test('core routes render with fixture data and no console errors', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'NETWORK NEXUS' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'NNS proposals accepting votes' })).toBeVisible();
  await page.getByRole('button', { name: /Subnet Management/ }).click();
  await expect(page.getByRole('link', { name: /Remove fixture node from subnet/ })).toBeVisible();
  await expect(page.getByText('Proposal action is not analysed')).toBeVisible();

  await page.goto(`/proposal/${proposalId.toString()}`);
  await expect(page.getByRole('heading', { name: 'Remove fixture node from subnet' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Proposal analysis' })).toBeVisible();
  await expect(page.getByText('Lifecycle mode: pre-execution')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'State change' })).toBeVisible();
  const external = page.getByRole('link', { name: 'https://forum.dfinity.org/t/fixture-proposal' });
  await expect(external).toHaveAttribute('target', '_blank');
  await expect(external).toHaveAttribute('rel', 'noopener noreferrer');

  await page.goto(`/subnet/${subnetId}`);
  await expect(page.getByRole('heading', { name: 'Application subnet' })).toBeVisible();
  await expect(page.getByText('Derived measurements for a 24-hour window; not canonical node status.')).toBeVisible();
  await expect(page.getByText('healthy_signal')).toBeVisible();
  await expect(page.getByText('insufficient_data')).toBeVisible();
  await expect(page.getByText('Manual external check - Not used by NNX validation')).toBeVisible();

  await page.goto(`/neuron/${neuronId.toString()}`);
  await expect(page.getByRole('heading', { name: 'Fixture neuron' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Topic coverage' })).toBeVisible();
});

test('malformed routes render not-found page', async ({ page }) => {
  for (const route of [
    '/proposal/not-a-number',
    '/proposal/1/extra',
    '/subnet/not-a-principal',
    '/neuron/not-a-number',
  ]) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  }
});

test('generated frontend env is served as parseable JSON', async ({ page }) => {
  await page.goto('/');
  const env = await page.evaluate(async () => {
    const response = await fetch('/generated/frontend-env.json', { cache: 'no-store' });
    return response.json();
  });
  expect(env).toHaveProperty('PUBLIC_CANISTER_ID:nnx_node_metrics_proxy');
});
