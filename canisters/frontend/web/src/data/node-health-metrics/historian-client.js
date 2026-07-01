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
  const HistorianError = idl.Record({
    code: idl.Text,
    message: idl.Text,
  });
  const Provenance = idl.Record({
    source: idl.Text,
    method: idl.Text,
    detail: idl.Text,
  });
  const RewardEventSummary = idl.Record({
    distributed_e8s_equivalent: idl.Opt(idl.Nat64),
    total_available_e8s_equivalent: idl.Opt(idl.Nat64),
    latest_round_available_e8s_equivalent: idl.Opt(idl.Nat64),
    rounds_since_last_distribution: idl.Opt(idl.Nat64),
  });
  const TokenomicsSnapshot = idl.Record({
    sampled_at_timestamp_seconds: idl.Nat64,
    governance_metrics_timestamp_seconds: idl.Opt(idl.Nat64),
    total_supply_e8s: idl.Opt(idl.Nat64),
    total_maturity_e8s_equivalent: idl.Opt(idl.Nat64),
    total_staked_maturity_e8s_equivalent: idl.Opt(idl.Nat64),
    total_maturity_disbursements_in_progress_e8s_equivalent: idl.Opt(idl.Nat64),
    total_staked_e8s: idl.Opt(idl.Nat64),
    total_locked_e8s: idl.Opt(idl.Nat64),
    below_voting_threshold_staked_e8s: idl.Opt(idl.Nat64),
    min_delay_band_staked_e8s: idl.Opt(idl.Nat64),
    middle_delay_band_staked_e8s: idl.Opt(idl.Nat64),
    max_delay_band_staked_e8s: idl.Opt(idl.Nat64),
    dissolve_delay_bucket_granularity_seconds: idl.Nat64,
    reward_event: idl.Opt(RewardEventSummary),
    icp_burned_total_e8s: idl.Opt(idl.Nat64),
    icp_burned_week_delta_e8s: idl.Opt(idl.Nat64),
    provenance: idl.Vec(Provenance),
    partial: idl.Bool,
    errors: idl.Vec(HistorianError),
  });
  const TokenomicsSnapshotQuery = idl.Record({
    start_at_timestamp_seconds: idl.Opt(idl.Nat64),
    end_at_timestamp_seconds: idl.Opt(idl.Nat64),
    limit: idl.Opt(idl.Nat32),
    cursor: idl.Opt(idl.Vec(idl.Nat8)),
  });
  const TokenomicsSnapshotPage = idl.Record({
    snapshots: idl.Vec(TokenomicsSnapshot),
    next_cursor: idl.Opt(idl.Vec(idl.Nat8)),
  });
  const SampleTokenomicsSnapshotResponse = idl.Record({
    snapshot: idl.Opt(TokenomicsSnapshot),
    partial: idl.Bool,
    errors: idl.Vec(HistorianError),
  });
  return idl.Service({
    get_node_metrics_history: idl.Func([NodeMetricsHistoryArgs], [NodeMetricsHistoryResponse], []),
    get_latest_tokenomics_snapshot: idl.Func([], [idl.Opt(TokenomicsSnapshot)], ['query']),
    list_tokenomics_snapshots: idl.Func([TokenomicsSnapshotQuery], [TokenomicsSnapshotPage], ['query']),
    sample_tokenomics_snapshot: idl.Func([], [SampleTokenomicsSnapshotResponse], []),
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
  function normalizeOptionalNat(value) {
    const unwrapped = Array.isArray(value) ? value[0] : value;
    return unwrapped === null || unwrapped === undefined ? null : BigInt(unwrapped);
  }

  function normalizeSnapshot(snapshot) {
    if (!snapshot) return null;
    return {
      sampledAtTimestampSeconds: BigInt(snapshot.sampled_at_timestamp_seconds),
      governanceMetricsTimestampSeconds:
        normalizeOptionalNat(snapshot.governance_metrics_timestamp_seconds),
      totalSupplyE8s: normalizeOptionalNat(snapshot.total_supply_e8s),
      totalMaturityE8sEquivalent: normalizeOptionalNat(snapshot.total_maturity_e8s_equivalent),
      totalStakedMaturityE8sEquivalent:
        normalizeOptionalNat(snapshot.total_staked_maturity_e8s_equivalent),
      totalMaturityDisbursementsInProgressE8sEquivalent:
        normalizeOptionalNat(snapshot.total_maturity_disbursements_in_progress_e8s_equivalent),
      totalStakedE8s: normalizeOptionalNat(snapshot.total_staked_e8s),
      totalLockedE8s: normalizeOptionalNat(snapshot.total_locked_e8s),
      belowVotingThresholdStakedE8s: normalizeOptionalNat(snapshot.below_voting_threshold_staked_e8s),
      minDelayBandStakedE8s: normalizeOptionalNat(snapshot.min_delay_band_staked_e8s),
      middleDelayBandStakedE8s: normalizeOptionalNat(snapshot.middle_delay_band_staked_e8s),
      maxDelayBandStakedE8s: normalizeOptionalNat(snapshot.max_delay_band_staked_e8s),
      dissolveDelayBucketGranularitySeconds:
        BigInt(snapshot.dissolve_delay_bucket_granularity_seconds),
      rewardEvent: Array.isArray(snapshot.reward_event)
        ? (snapshot.reward_event[0] ?? null)
        : (snapshot.reward_event ?? null),
      icpBurnedTotalE8s: normalizeOptionalNat(snapshot.icp_burned_total_e8s),
      icpBurnedWeekDeltaE8s: normalizeOptionalNat(snapshot.icp_burned_week_delta_e8s),
      provenance: (snapshot.provenance ?? []).map((item) => ({
        source: String(item.source ?? ''),
        method: String(item.method ?? ''),
        detail: String(item.detail ?? ''),
      })),
      partial: Boolean(snapshot.partial),
      errors: (snapshot.errors ?? []).map((error) => ({
        code: String(error.code ?? 'TOKENOMICS_ERROR'),
        message: String(error.message ?? ''),
      })),
    };
  }

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
    async getLatestTokenomicsSnapshot() {
      if (!actor?.get_latest_tokenomics_snapshot) return null;
      const response = await actor.get_latest_tokenomics_snapshot();
      const snapshot = Array.isArray(response) ? (response[0] ?? null) : response;
      return normalizeSnapshot(snapshot);
    },
    async listTokenomicsSnapshots({ startAt, endAt, limit, cursor } = {}) {
      if (!actor?.list_tokenomics_snapshots) {
        return { snapshots: [], nextCursor: null };
      }
      const response = await actor.list_tokenomics_snapshots({
        start_at_timestamp_seconds: startAt === undefined || startAt === null ? [] : [BigInt(startAt)],
        end_at_timestamp_seconds: endAt === undefined || endAt === null ? [] : [BigInt(endAt)],
        limit: limit === undefined || limit === null ? [] : [Number(limit)],
        cursor: cursor ? [cursor] : [],
      });
      return {
        snapshots: (response.snapshots ?? []).map(normalizeSnapshot).filter(Boolean),
        nextCursor: Array.isArray(response.next_cursor)
          ? (response.next_cursor[0] ?? null)
          : (response.next_cursor ?? null),
      };
    },
  });
}
