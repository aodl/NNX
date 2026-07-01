import assert from 'node:assert/strict';
import test from 'node:test';

import { NODE_HEALTH_SIGNALS } from '../src/data/node-health-metrics/node-health-policy.js';
import { deriveNodeHealthMetrics } from '../src/data/node-health-metrics/node-health-signals.js';
import { getSubnetNodeHealthMetrics } from '../src/data/node-health-metrics/node-health-metrics.js';

const base = {
  nodeId: 'node-1',
  windowHours: 24,
};

function record(timestampNanos, proposed, failed) {
  return {
    nodeId: 'node-1',
    timestampNanos: BigInt(timestampNanos),
    numBlocksProposedTotal: BigInt(proposed),
    numBlockFailuresTotal: BigInt(failed),
  };
}

test('two increasing cumulative samples produce correct deltas', () => {
  const metric = deriveNodeHealthMetrics({
    ...base,
    records: [record(1, 10, 1), record(2, 20, 2)],
  });
  assert.equal(metric.proposedDelta, 10);
  assert.equal(metric.failedDelta, 1);
  assert.equal(metric.sampleSize, 11);
});

test('three increasing cumulative samples sum correctly', () => {
  const metric = deriveNodeHealthMetrics({
    ...base,
    records: [record(1, 10, 1), record(2, 12, 1), record(3, 25, 4)],
  });
  assert.equal(metric.proposedDelta, 15);
  assert.equal(metric.failedDelta, 3);
});

test('counter reset is handled and marked', () => {
  const metric = deriveNodeHealthMetrics({
    ...base,
    records: [record(1, 100, 5), record(2, 4, 1), record(3, 7, 3)],
  });
  assert.equal(metric.proposedDelta, 7);
  assert.equal(metric.failedDelta, 3);
  assert.equal(metric.counterResetObserved, true);
});

test('one sample is insufficient data', () => {
  const metric = deriveNodeHealthMetrics({ ...base, records: [record(1, 1, 0)] });
  assert.equal(metric.healthSignal, NODE_HEALTH_SIGNALS.INSUFFICIENT_DATA);
});

test('no node records while subnet has records is inactive/no-block signal', () => {
  const metric = deriveNodeHealthMetrics({
    ...base,
    records: [],
    otherSubnetNodesHaveRecords: true,
  });
  assert.equal(metric.healthSignal, NODE_HEALTH_SIGNALS.INACTIVE_OR_NO_BLOCK);
});

test('two unchanged node records while subnet has activity is inactive/no-block signal', () => {
  const metric = deriveNodeHealthMetrics({
    ...base,
    records: [record(1, 10, 0), record(2, 10, 0)],
    otherSubnetNodesHaveRecords: true,
  });
  assert.equal(metric.healthSignal, NODE_HEALTH_SIGNALS.INACTIVE_OR_NO_BLOCK);
});

test('failed count threshold produces elevated failure signal', () => {
  const metric = deriveNodeHealthMetrics({ ...base, records: [record(1, 10, 0), record(2, 12, 3)] });
  assert.equal(metric.healthSignal, NODE_HEALTH_SIGNALS.ELEVATED_FAILURE);
});

test('failed rate threshold produces elevated failure signal', () => {
  const metric = deriveNodeHealthMetrics({ ...base, records: [record(1, 10, 0), record(2, 19, 1)] });
  assert.equal(metric.healthSignal, NODE_HEALTH_SIGNALS.ELEVATED_FAILURE);
});

test('no subnet records produces unavailable', () => {
  const metric = deriveNodeHealthMetrics({ ...base, records: [] });
  assert.equal(metric.healthSignal, NODE_HEALTH_SIGNALS.UNAVAILABLE);
});

test('metric objects include first and last timestamps and sample count', () => {
  const metric = deriveNodeHealthMetrics({ ...base, records: [record(1, 10, 0), record(2, 19, 1)] });
  assert.equal(metric.firstTimestampNanos, 1n);
  assert.equal(metric.lastTimestampNanos, 2n);
  assert.equal(metric.sampleCount, 2);
});

test('unavailable metrics when historian query fails', async () => {
  const result = await getSubnetNodeHealthMetrics({
    queryFacade: { getNodeMetricsHistory: async () => { throw new Error('no historian'); } },
    subnetId: 'subnet',
    nodeIds: ['node-1'],
    startAtTimestampNanos: 1n,
    endAtTimestampNanos: 2n,
  });
  assert.equal(result.partial, true);
  assert.equal(result.errors[0].code, 'NODE_METRICS_UNAVAILABLE');
  assert.equal(result.metrics[0].healthSignal, NODE_HEALTH_SIGNALS.UNAVAILABLE);
  assert.equal(result.metrics[0].sampleCount, 0);
});

test('node metrics labels do not use canonical status wording', () => {
  const text = Object.values(NODE_HEALTH_SIGNALS).join(' ');
  assert.equal(/\bDOWN\b|\bDEGRADED\b/i.test(text), false);
});
