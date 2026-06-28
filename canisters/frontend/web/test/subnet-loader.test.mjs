import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSubnetLoader,
  groupSubnetsByNodeCount,
  labelizeIdentifier,
  specialSubnetLabel,
  subnetVisibility,
  subnetVisibilityLabel,
} from '../src/data/subnet-loader.js';

test('labelizes registry-style identifiers', () => {
  assert.equal(labelizeIdentifier('verified_application'), 'Verified Application');
  assert.equal(labelizeIdentifier('cloud_engine'), 'Cloud Engine');
  assert.equal(labelizeIdentifier(''), 'Unknown');
});

test('groups subnets by node count descending', () => {
  const groups = groupSubnetsByNodeCount([
    { id: 'subnet-b', nodeCount: 13 },
    { id: 'subnet-c', nodeCount: 28 },
    { id: 'subnet-a', nodeCount: 13 },
  ]);

  assert.deepEqual(groups.map((group) => group.nodeCount), [28, 13]);
  assert.deepEqual(groups[1].subnets.map((subnet) => subnet.id), ['subnet-a', 'subnet-b']);
});

test('orders subnets in a group by special label, private visibility, type, then id', () => {
  const groups = groupSubnetsByNodeCount([
    { id: 'public-application', nodeCount: 13, visibility: 'public', type: 'application', cmcLabel: null },
    { id: 'private-application', nodeCount: 13, visibility: 'private', type: 'application', cmcLabel: null },
    { id: 'private-special-b', nodeCount: 13, visibility: 'private', type: 'system', cmcLabel: 'NNS' },
    { id: 'public-special-b', nodeCount: 13, visibility: 'public', type: 'application', cmcLabel: 'SNS' },
    { id: 'private-special-a', nodeCount: 13, visibility: 'private', type: 'system', cmcLabel: 'Bitcoin' },
    { id: 'public-cloud-engine', nodeCount: 13, visibility: 'public', type: 'cloud_engine', cmcLabel: null },
    {
      id: 'private-verified-application',
      nodeCount: 13,
      visibility: 'private',
      type: 'verified_application',
      cmcLabel: null,
    },
    { id: 'public-unknown', nodeCount: 13, visibility: 'public', type: 'unknown', cmcLabel: null },
    {
      id: 'public-verified-application',
      nodeCount: 13,
      visibility: 'public',
      type: 'verified_application',
      cmcLabel: null,
    },
  ]);

  assert.deepEqual(groups[0].subnets.map((subnet) => subnet.id), [
    'private-special-a',
    'private-special-b',
    'public-special-b',
    'private-verified-application',
    'private-application',
    'public-cloud-engine',
    'public-verified-application',
    'public-application',
    'public-unknown',
  ]);
});

test('distinguishes public subnets through CMC public subnet IDs', () => {
  assert.equal(subnetVisibility({ id: 'subnet-1', type: 'cloud_engine' }, ['subnet-1']), 'public');
  assert.equal(subnetVisibility({ id: 'subnet-2', type: 'application' }, ['subnet-1']), 'private');
});

test('labels subnet visibility with permission terminology', () => {
  assert.equal(subnetVisibilityLabel('public'), 'Permissionless');
  assert.equal(subnetVisibilityLabel('private'), 'Unknown');
  assert.equal(subnetVisibilityLabel('unknown'), 'Unknown');
});

test('labels known special subnets by subnet ID', () => {
  assert.equal(
    specialSubnetLabel('tdb26-jop6k-aogll-7ltgs-eruif-6kk7m-qpktf-gdiqx-mxtrf-vb5e6-eqe'),
    'NNS',
  );
  assert.equal(
    specialSubnetLabel('uzr34-akd3s-xrdag-3ql62-ocgoh-ld2ao-tamcv-54e7j-krwgb-2gm4z-oqe'),
    'II',
  );
  assert.equal(
    specialSubnetLabel('w4rem-dv5e3-widiz-wbpea-kbttk-mnzfm-tzrc7-svcj3-kbxyb-zamch-hqe'),
    'Bitcoin',
  );
  assert.equal(
    specialSubnetLabel('x33ed-h457x-bsgyx-oqxqf-6pzwv-wkhzr-rm2j3-npodi-purzm-n66cg-gae'),
    'SNS',
  );
  assert.equal(specialSubnetLabel('subnet-1'), null);
});

test('subnet loader attaches CMC labels and preserves warnings', async () => {
  const loader = createSubnetLoader({
    queryFacade: {
      getIcSubnets: async () => ({
        subnets: [
          { id: 'subnet-1', nodeCount: 13, type: 'application' },
          { id: 'subnet-2', nodeCount: 13, type: 'cloud_engine' },
        ],
        warnings: [{ code: 'REGISTRY_RESPONSE_ERR' }],
      }),
      getCmcSubnetLabels: async () => ({
        labelsBySubnetId: { 'subnet-2': 'Fiduciary' },
        defaultSubnetIds: ['subnet-1'],
        publicSubnetIds: ['subnet-1', 'subnet-2'],
        warnings: [{ code: 'VALIDATION_FAILED' }],
      }),
    },
  });

  const result = await loader.loadSubnetGroups();

  assert.equal(result.subnets[0].registryTypeLabel, 'Application');
  assert.equal(result.subnets[0].visibility, 'public');
  assert.equal(result.subnets[0].visibilityLabel, 'Permissionless');
  assert.equal(result.subnets[0].cmcLabel, null);
  assert.equal(result.subnets[1].registryTypeLabel, 'Cloud Engine');
  assert.equal(result.subnets[1].visibility, 'public');
  assert.equal(result.subnets[1].visibilityLabel, 'Permissionless');
  assert.equal(result.subnets[1].cmcLabel, 'Fiduciary');
  assert.equal(result.groups.length, 1);
  assert.equal(result.warnings.length, 2);
});

test('subnet loader uses special labels only when CMC has no label', async () => {
  const nnsSubnetId = 'tdb26-jop6k-aogll-7ltgs-eruif-6kk7m-qpktf-gdiqx-mxtrf-vb5e6-eqe';
  const snsSubnetId = 'x33ed-h457x-bsgyx-oqxqf-6pzwv-wkhzr-rm2j3-npodi-purzm-n66cg-gae';
  const loader = createSubnetLoader({
    queryFacade: {
      getIcSubnets: async () => ({
        subnets: [
          { id: nnsSubnetId, nodeCount: 40, type: 'system' },
          { id: snsSubnetId, nodeCount: 34, type: 'application' },
        ],
        warnings: [],
      }),
      getCmcSubnetLabels: async () => ({
        labelsBySubnetId: { [snsSubnetId]: 'CMC SNS' },
        defaultSubnetIds: [],
        publicSubnetIds: [],
        warnings: [],
      }),
    },
  });

  const result = await loader.loadSubnetGroups();

  assert.equal(result.subnets[0].cmcLabel, 'NNS');
  assert.equal(result.subnets[1].cmcLabel, 'CMC SNS');
});
