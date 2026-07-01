import { Actor } from '@icp-sdk/core/agent';
import { IDL } from '@icp-sdk/core/candid';
import { Principal } from '@icp-sdk/core/principal';

export function idlFactory({ IDL: idl }) {
  const NodeMetricsHistoryArgs = idl.Record({
    subnet_id: idl.Principal,
    start_at_timestamp_nanos: idl.Nat64,
    end_at_timestamp_nanos: idl.Nat64,
  });
  const NodeMetricsHistoryRecord = idl.Record({
    node_id: idl.Principal,
    timestamp_nanos: idl.Nat64,
    num_blocks_proposed_total: idl.Nat64,
    num_block_failures_total: idl.Nat64,
  });
  const NodeMetricsError = idl.Record({
    code: idl.Text,
    message: idl.Text,
  });
  const NodeMetricsHistoryResponse = idl.Record({
    subnet_id: idl.Principal,
    start_at_timestamp_nanos: idl.Nat64,
    end_at_timestamp_nanos: idl.Nat64,
    records: idl.Vec(NodeMetricsHistoryRecord),
    partial: idl.Bool,
    errors: idl.Vec(NodeMetricsError),
  });
  return idl.Service({
    get_node_metrics_history: idl.Func([NodeMetricsHistoryArgs], [NodeMetricsHistoryResponse], []),
  });
}

export function createHistorianActor({ agent, canisterId }) {
  if (!agent || !canisterId) return null;
  return Actor.createActor(idlFactory, { agent, canisterId });
}

function toPrincipal(value) {
  if (typeof value?.toText === 'function') return value;
  return Principal.fromText(value);
}

export function createHistorianClient({ actor = null } = {}) {
  return Object.freeze({
    async getNodeMetricsHistory(args) {
      if (!actor?.get_node_metrics_history) {
        return {
          subnetId: args.subnetId,
          startAtTimestampNanos: args.startAtTimestampNanos,
          endAtTimestampNanos: args.endAtTimestampNanos,
          records: [],
          partial: true,
          errors: [{ code: 'HISTORIAN_NOT_CONFIGURED', message: 'Historian actor is unavailable.' }],
        };
      }
      const response = await actor.get_node_metrics_history({
        subnet_id: toPrincipal(args.subnetId),
        start_at_timestamp_nanos: BigInt(args.startAtTimestampNanos),
        end_at_timestamp_nanos: BigInt(args.endAtTimestampNanos),
      });
      return {
        subnetId: response.subnet_id?.toText?.() ?? args.subnetId,
        startAtTimestampNanos: BigInt(response.start_at_timestamp_nanos),
        endAtTimestampNanos: BigInt(response.end_at_timestamp_nanos),
        partial: Boolean(response.partial),
        errors: (response.errors ?? []).map((error) => ({
          code: String(error.code ?? 'NODE_METRICS_ERROR'),
          message: String(error.message ?? ''),
        })),
        records: (response.records ?? []).map((record) => ({
          nodeId: record.node_id?.toText?.() ?? String(record.node_id),
          timestampNanos: BigInt(record.timestamp_nanos),
          numBlocksProposedTotal: BigInt(record.num_blocks_proposed_total),
          numBlockFailuresTotal: BigInt(record.num_block_failures_total),
        })),
      };
    },
  });
}
