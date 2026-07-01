import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTokenomicsService,
  formatIcpE8s,
  prepareTokenomicsView,
} from '../src/data/tokenomics/tokenomics-service.js';

test('e8s conversion is safe for BigInt', () => {
  assert.equal(formatIcpE8s(123_456_789n, { compact: false }), '1.23456789 ICP');
});

test('historian unavailable renders unavailable tokenomics view', async () => {
  const service = createTokenomicsService({ queryFacade: {} });
  const view = await service.loadTokenomics();
  assert.equal(view.unavailable, true);
});

test('latest snapshot renders metric-ready normalized values', () => {
  const view = prepareTokenomicsView({
    latest: {
      sampledAtTimestampSeconds: 10n,
      totalStakedE8s: 20n,
      partial: true,
      errors: [{ code: 'PARTIAL', message: 'partial' }],
      provenance: [{ source: 'NNS Governance', method: 'get_metrics' }],
    },
    snapshots: [{ sampledAtTimestampSeconds: 10n, totalStakedE8s: 20n }],
  });
  assert.equal(view.unavailable, false);
  assert.equal(view.partial, true);
  assert.equal(view.latest.totalStakedE8s, 20n);
  assert.equal(view.series.staked.length, 1);
});

test('no dashboard API calls are present in tokenomics service source', async () => {
  const source = await import('node:fs/promises')
    .then((fs) => fs.readFile(new URL('../src/data/tokenomics/tokenomics-service.js', import.meta.url), 'utf8'));
  assert.equal(source.includes('dashboard.internetcomputer.org'), false);
  assert.equal(source.includes('ic-api.internetcomputer.org'), false);
});
