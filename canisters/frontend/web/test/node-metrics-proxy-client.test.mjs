import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNodeMetricsProxyClient,
  idlFactory,
} from '../src/data/node-health-metrics/node-metrics-proxy-client.js';

test('node metrics proxy IDL uses update method shape', () => {
  const calls = [];
  const fakeIdl = {
    Principal: 'principal',
    Nat64: 'nat64',
    Text: 'text',
    Bool: 'bool',
    Record: (fields) => ({ kind: 'record', fields }),
    Vec: (value) => ({ kind: 'vec', value }),
    Func: (args, results, annotations) => {
      calls.push({ args, results, annotations });
      return { kind: 'func', args, results, annotations };
    },
    Service: (methods) => ({ kind: 'service', methods }),
  };
  const service = idlFactory({ IDL: fakeIdl });
  assert.deepEqual(service.methods.get_node_metrics_history.annotations, []);
  assert.equal(calls.length, 1);
});

test('node metrics proxy client normalizes actor response', async () => {
  const client = createNodeMetricsProxyClient({
    actor: {
      async get_node_metrics_history() {
        return {
          subnet_id: { toText: () => 'subnet' },
          start_at_timestamp_nanos: 1n,
          end_at_timestamp_nanos: 2n,
          partial: false,
          errors: [],
          records: [{
            node_id: { toText: () => 'node' },
            timestamp_nanos: 2n,
            num_blocks_proposed_total: 10n,
            num_block_failures_total: 1n,
          }],
        };
      },
    },
  });
  const result = await client.getNodeMetricsHistory({
    subnetId: '2vxsx-fae',
    startAtTimestampNanos: 1n,
    endAtTimestampNanos: 2n,
  });
  assert.equal(result.subnetId, 'subnet');
  assert.equal(result.records[0].nodeId, 'node');
  assert.equal(result.records[0].timestampNanos, 2n);
  assert.equal(result.records[0].numBlocksProposedTotal, 10n);
  assert.equal(result.records[0].numBlockFailuresTotal, 1n);
});

test('node metrics proxy client handles unavailable proxy', async () => {
  const client = createNodeMetricsProxyClient();
  const result = await client.getNodeMetricsHistory({
    subnetId: '2vxsx-fae',
    startAtTimestampNanos: 1n,
    endAtTimestampNanos: 2n,
  });
  assert.equal(result.partial, true);
  assert.equal(result.errors[0].code, 'NODE_METRICS_PROXY_NOT_CONFIGURED');
  assert.deepEqual(result.records, []);
});

test('node metrics proxy client preserves returned errors', async () => {
  const client = createNodeMetricsProxyClient({
    actor: {
      async get_node_metrics_history() {
        return {
          subnet_id: { toText: () => 'subnet' },
          start_at_timestamp_nanos: 1n,
          end_at_timestamp_nanos: 2n,
          partial: true,
          errors: [{ code: 'MANAGEMENT_CANISTER_CALL_FAILED', message: 'unsupported' }],
          records: [],
        };
      },
    },
  });
  const result = await client.getNodeMetricsHistory({
    subnetId: '2vxsx-fae',
    startAtTimestampNanos: 1n,
    endAtTimestampNanos: 2n,
  });
  assert.equal(result.partial, true);
  assert.equal(result.errors[0].code, 'MANAGEMENT_CANISTER_CALL_FAILED');
});
