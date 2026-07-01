use candid::{CandidType, Principal};
use ic_cdk::call::Call;
use ic_cdk::{query, update};
use ic_stable_structures::{
    memory_manager::{MemoryId, MemoryManager, VirtualMemory},
    DefaultMemoryImpl, StableBTreeMap,
};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;

const MANAGEMENT_CANISTER_ID: Principal = Principal::management_canister();
const MAX_WINDOW_NANOS: u64 = 24 * 60 * 60 * 1_000_000_000;
const MAX_RECORDS: usize = 20_000;
const WEEK_SECONDS: u64 = 7 * 24 * 60 * 60;
const TOKENOMICS_RETENTION_SAMPLES: usize = 260;
const TOKENOMICS_QUERY_LIMIT_DEFAULT: u32 = 52;
const TOKENOMICS_QUERY_LIMIT_MAX: u32 = 104;
const HALF_YEAR_SECONDS: u64 = 15_778_476;
const TOKENOMICS_SNAPSHOT_MEM_ID: MemoryId = MemoryId::new(0);

type Memory = VirtualMemory<DefaultMemoryImpl>;

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));

    static TOKENOMICS_SNAPSHOTS: RefCell<StableBTreeMap<u64, Vec<u8>, Memory>> =
        RefCell::new(StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(TOKENOMICS_SNAPSHOT_MEM_ID))
        ));
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct NodeMetricsHistoryArgs {
    pub subnet_id: Principal,
    pub start_at_timestamp_nanos: u64,
    pub end_at_timestamp_nanos: u64,
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ManagementNodeMetricsHistoryArgs {
    pub subnet_id: Principal,
    pub start_at_timestamp_nanos: u64,
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ManagementNodeMetrics {
    pub node_id: Principal,
    pub num_blocks_proposed_total: u64,
    pub num_block_failures_total: u64,
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ManagementNodeMetricsHistorySample {
    pub timestamp_nanos: u64,
    pub node_metrics: Vec<ManagementNodeMetrics>,
}

pub type ManagementNodeMetricsHistoryResult = Vec<ManagementNodeMetricsHistorySample>;

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct NodeMetricsHistoryRecord {
    pub node_id: Principal,
    pub timestamp_nanos: u64,
    pub num_blocks_proposed_total: u64,
    pub num_block_failures_total: u64,
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct NodeMetricsError {
    pub code: String,
    pub message: String,
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct NodeMetricsHistoryResponse {
    pub subnet_id: Principal,
    pub start_at_timestamp_nanos: u64,
    pub end_at_timestamp_nanos: u64,
    pub records: Vec<NodeMetricsHistoryRecord>,
    pub partial: bool,
    pub errors: Vec<NodeMetricsError>,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug, PartialEq, Eq)]
pub struct HistorianError {
    pub code: String,
    pub message: String,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug, PartialEq, Eq)]
pub struct Provenance {
    pub source: String,
    pub method: String,
    pub detail: String,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug, PartialEq, Eq)]
pub struct RewardEventSummary {
    pub distributed_e8s_equivalent: Option<u64>,
    pub total_available_e8s_equivalent: Option<u64>,
    pub latest_round_available_e8s_equivalent: Option<u64>,
    pub rounds_since_last_distribution: Option<u64>,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug, PartialEq, Eq)]
pub struct TokenomicsSnapshot {
    pub sampled_at_timestamp_seconds: u64,
    pub governance_metrics_timestamp_seconds: Option<u64>,
    pub total_supply_e8s: Option<u64>,
    pub total_maturity_e8s_equivalent: Option<u64>,
    pub total_staked_maturity_e8s_equivalent: Option<u64>,
    pub total_maturity_disbursements_in_progress_e8s_equivalent: Option<u64>,
    pub total_staked_e8s: Option<u64>,
    pub total_locked_e8s: Option<u64>,
    pub below_voting_threshold_staked_e8s: Option<u64>,
    pub min_delay_band_staked_e8s: Option<u64>,
    pub middle_delay_band_staked_e8s: Option<u64>,
    pub max_delay_band_staked_e8s: Option<u64>,
    pub dissolve_delay_bucket_granularity_seconds: u64,
    pub reward_event: Option<RewardEventSummary>,
    pub icp_burned_total_e8s: Option<u64>,
    pub icp_burned_week_delta_e8s: Option<u64>,
    pub provenance: Vec<Provenance>,
    pub partial: bool,
    pub errors: Vec<HistorianError>,
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct SampleTokenomicsSnapshotResponse {
    pub snapshot: Option<TokenomicsSnapshot>,
    pub partial: bool,
    pub errors: Vec<HistorianError>,
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct TokenomicsSnapshotQuery {
    pub start_at_timestamp_seconds: Option<u64>,
    pub end_at_timestamp_seconds: Option<u64>,
    pub limit: Option<u32>,
    pub cursor: Option<Vec<u8>>,
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct TokenomicsSnapshotPage {
    pub snapshots: Vec<TokenomicsSnapshot>,
    pub next_cursor: Option<Vec<u8>>,
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq)]
struct GovernanceCachedMetrics {
    total_maturity_e8s_equivalent: u64,
    not_dissolving_neurons_e8s_buckets: Vec<(u64, f64)>,
    total_supply_icp: u64,
    total_staked_e8s: u64,
    total_locked_e8s: u64,
    total_staked_maturity_e8s_equivalent: u64,
    neurons_with_less_than_6_months_dissolve_delay_e8s: u64,
    dissolving_neurons_e8s_buckets: Vec<(u64, f64)>,
    timestamp_seconds: u64,
    total_maturity_disbursements_in_progress_e8s_equivalent: u64,
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq, Eq)]
struct GovernanceError {
    error_type: i32,
    error_message: String,
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq)]
enum GovernanceMetricsResult {
    Ok(GovernanceCachedMetrics),
    Err(GovernanceError),
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq, Eq)]
struct GovernanceRewardEvent {
    rounds_since_last_distribution: Option<u64>,
    total_available_e8s_equivalent: u64,
    latest_round_available_e8s_equivalent: Option<u64>,
    distributed_e8s_equivalent: u64,
}

fn nns_governance_canister_id() -> Principal {
    Principal::from_text("rrkah-fqaaa-aaaaa-aaaaq-cai")
        .expect("NNS Governance canister principal must be valid")
}

fn now_seconds() -> u64 {
    ic_cdk::api::time() / 1_000_000_000
}

fn iso_week_key(timestamp_seconds: u64) -> u64 {
    timestamp_seconds / WEEK_SECONDS
}

fn f64_e8s_to_u64(value: f64) -> u64 {
    if !value.is_finite() || value <= 0.0 {
        return 0;
    }
    if value >= u64::MAX as f64 {
        return u64::MAX;
    }
    value.round() as u64
}

fn checked_add_e8s(total: &mut u64, value: u64) -> bool {
    match total.checked_add(value) {
        Some(next) => {
            *total = next;
            true
        }
        None => {
            *total = u64::MAX;
            false
        }
    }
}

pub fn derive_dissolve_delay_bands(
    below_voting_threshold_e8s: u64,
    dissolving: &[(u64, f64)],
    not_dissolving: &[(u64, f64)],
) -> (
    Option<u64>,
    Option<u64>,
    Option<u64>,
    Option<u64>,
    Vec<HistorianError>,
) {
    let mut min_delay = 0u64;
    let mut middle = 0u64;
    let mut maximum = 0u64;
    let mut overflow = false;

    for (bucket, value) in dissolving.iter().chain(not_dissolving.iter()) {
        let amount = f64_e8s_to_u64(*value);
        match *bucket {
            1 => overflow |= !checked_add_e8s(&mut min_delay, amount),
            2..=15 => overflow |= !checked_add_e8s(&mut middle, amount),
            16 => overflow |= !checked_add_e8s(&mut maximum, amount),
            _ => {}
        }
    }

    let errors = if overflow {
        vec![HistorianError {
            code: "DISSOLVE_DELAY_BAND_OVERFLOW".to_string(),
            message: "Dissolve-delay band totals exceeded u64 and were saturated.".to_string(),
        }]
    } else {
        vec![]
    };

    (
        Some(below_voting_threshold_e8s),
        Some(min_delay),
        Some(middle),
        Some(maximum),
        errors,
    )
}

fn reward_summary(event: GovernanceRewardEvent) -> RewardEventSummary {
    RewardEventSummary {
        distributed_e8s_equivalent: Some(event.distributed_e8s_equivalent),
        total_available_e8s_equivalent: Some(event.total_available_e8s_equivalent),
        latest_round_available_e8s_equivalent: event.latest_round_available_e8s_equivalent,
        rounds_since_last_distribution: event.rounds_since_last_distribution,
    }
}

fn snapshot_from_metrics(
    sampled_at_timestamp_seconds: u64,
    metrics: GovernanceCachedMetrics,
    reward_event: Option<RewardEventSummary>,
    mut errors: Vec<HistorianError>,
) -> TokenomicsSnapshot {
    let (
        below_voting_threshold_staked_e8s,
        min_delay_band_staked_e8s,
        middle_delay_band_staked_e8s,
        max_delay_band_staked_e8s,
        band_errors,
    ) = derive_dissolve_delay_bands(
        metrics.neurons_with_less_than_6_months_dissolve_delay_e8s,
        &metrics.dissolving_neurons_e8s_buckets,
        &metrics.not_dissolving_neurons_e8s_buckets,
    );
    errors.extend(band_errors);
    errors.push(HistorianError {
        code: "ICP_BURNED_UNAVAILABLE".to_string(),
        message:
            "ICP burned requires a bounded ledger/index/archive scanner and is not initialized."
                .to_string(),
    });

    TokenomicsSnapshot {
        sampled_at_timestamp_seconds,
        governance_metrics_timestamp_seconds: Some(metrics.timestamp_seconds),
        total_supply_e8s: metrics.total_supply_icp.checked_mul(100_000_000),
        total_maturity_e8s_equivalent: Some(metrics.total_maturity_e8s_equivalent),
        total_staked_maturity_e8s_equivalent: Some(metrics.total_staked_maturity_e8s_equivalent),
        total_maturity_disbursements_in_progress_e8s_equivalent: Some(
            metrics.total_maturity_disbursements_in_progress_e8s_equivalent,
        ),
        total_staked_e8s: Some(metrics.total_staked_e8s),
        total_locked_e8s: Some(metrics.total_locked_e8s),
        below_voting_threshold_staked_e8s,
        min_delay_band_staked_e8s,
        middle_delay_band_staked_e8s,
        max_delay_band_staked_e8s,
        dissolve_delay_bucket_granularity_seconds: HALF_YEAR_SECONDS,
        reward_event,
        icp_burned_total_e8s: None,
        icp_burned_week_delta_e8s: None,
        provenance: vec![Provenance {
            source: "NNS Governance".to_string(),
            method: "get_metrics".to_string(),
            detail: "Governance cached metrics; dissolve-delay buckets use half-year granularity."
                .to_string(),
        }],
        partial: !errors.is_empty(),
        errors,
    }
}

fn encode_snapshot(snapshot: &TokenomicsSnapshot) -> Vec<u8> {
    candid::encode_one(snapshot).expect("TokenomicsSnapshot Candid encoding failed")
}

fn decode_snapshot(bytes: Vec<u8>) -> Option<TokenomicsSnapshot> {
    candid::decode_one(&bytes).ok()
}

fn store_snapshot(snapshot: TokenomicsSnapshot) -> TokenomicsSnapshot {
    let key = iso_week_key(snapshot.sampled_at_timestamp_seconds);
    TOKENOMICS_SNAPSHOTS.with(|snapshots| {
        snapshots
            .borrow_mut()
            .insert(key, encode_snapshot(&snapshot));
    });
    prune_tokenomics_snapshots();
    snapshot
}

fn prune_tokenomics_snapshots() {
    TOKENOMICS_SNAPSHOTS.with(|snapshots| {
        let mut snapshots = snapshots.borrow_mut();
        let len = snapshots.len() as usize;
        if len <= TOKENOMICS_RETENTION_SAMPLES {
            return;
        }
        let remove_count = len - TOKENOMICS_RETENTION_SAMPLES;
        let keys: Vec<u64> = snapshots
            .iter()
            .take(remove_count)
            .map(|entry| *entry.key())
            .collect();
        for key in keys {
            snapshots.remove(&key);
        }
    });
}

fn all_snapshots() -> Vec<TokenomicsSnapshot> {
    TOKENOMICS_SNAPSHOTS.with(|snapshots| {
        snapshots
            .borrow()
            .iter()
            .filter_map(|entry| decode_snapshot(entry.value()))
            .collect()
    })
}

fn cursor_to_offset(cursor: Option<Vec<u8>>) -> usize {
    let Some(cursor) = cursor else { return 0 };
    if cursor.len() != 8 {
        return 0;
    }
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&cursor);
    u64::from_be_bytes(bytes) as usize
}

fn offset_to_cursor(offset: usize) -> Vec<u8> {
    (offset as u64).to_be_bytes().to_vec()
}

async fn read_reward_event(errors: &mut Vec<HistorianError>) -> Option<RewardEventSummary> {
    match Call::bounded_wait(nns_governance_canister_id(), "get_latest_reward_event").await {
        Ok(response) => match response.candid::<GovernanceRewardEvent>() {
            Ok(event) => Some(reward_summary(event)),
            Err(error) => {
                errors.push(HistorianError {
                    code: "REWARD_EVENT_DECODE_FAILED".to_string(),
                    message: error.to_string(),
                });
                None
            }
        },
        Err(error) => {
            errors.push(HistorianError {
                code: "REWARD_EVENT_CALL_FAILED".to_string(),
                message: error.to_string(),
            });
            None
        }
    }
}

pub fn bounded_args(
    args: NodeMetricsHistoryArgs,
) -> Result<NodeMetricsHistoryArgs, NodeMetricsError> {
    if args.end_at_timestamp_nanos <= args.start_at_timestamp_nanos {
        return Err(NodeMetricsError {
            code: "INVALID_TIME_RANGE".to_string(),
            message: "end_at_timestamp_nanos must be greater than start_at_timestamp_nanos."
                .to_string(),
        });
    }
    if args.end_at_timestamp_nanos - args.start_at_timestamp_nanos > MAX_WINDOW_NANOS {
        return Err(NodeMetricsError {
            code: "WINDOW_TOO_LARGE".to_string(),
            message: "node metrics requests are limited to a 24 hour window.".to_string(),
        });
    }
    Ok(args)
}

pub fn normalize_response(
    args: &NodeMetricsHistoryArgs,
    raw: ManagementNodeMetricsHistoryResult,
) -> NodeMetricsHistoryResponse {
    let mut records: Vec<_> = raw
        .into_iter()
        .filter(|sample| {
            sample.timestamp_nanos >= args.start_at_timestamp_nanos
                && sample.timestamp_nanos <= args.end_at_timestamp_nanos
        })
        .flat_map(|sample| {
            sample
                .node_metrics
                .into_iter()
                .map(move |metric| NodeMetricsHistoryRecord {
                    node_id: metric.node_id,
                    timestamp_nanos: sample.timestamp_nanos,
                    num_blocks_proposed_total: metric.num_blocks_proposed_total,
                    num_block_failures_total: metric.num_block_failures_total,
                })
        })
        .collect();
    records.sort_by_key(|record| (record.node_id, record.timestamp_nanos));
    let partial = records.len() > MAX_RECORDS;
    records.truncate(MAX_RECORDS);
    let errors = if partial {
        vec![NodeMetricsError {
            code: "RESPONSE_TRUNCATED".to_string(),
            message: "node metrics response exceeded the historian record limit.".to_string(),
        }]
    } else {
        vec![]
    };

    NodeMetricsHistoryResponse {
        subnet_id: args.subnet_id,
        start_at_timestamp_nanos: args.start_at_timestamp_nanos,
        end_at_timestamp_nanos: args.end_at_timestamp_nanos,
        records,
        partial,
        errors,
    }
}

pub fn error_response(
    args: &NodeMetricsHistoryArgs,
    error: NodeMetricsError,
) -> NodeMetricsHistoryResponse {
    NodeMetricsHistoryResponse {
        subnet_id: args.subnet_id,
        start_at_timestamp_nanos: args.start_at_timestamp_nanos,
        end_at_timestamp_nanos: args.end_at_timestamp_nanos,
        records: vec![],
        partial: true,
        errors: vec![error],
    }
}

#[update]
async fn get_node_metrics_history(args: NodeMetricsHistoryArgs) -> NodeMetricsHistoryResponse {
    let bounded = match bounded_args(args.clone()) {
        Ok(args) => args,
        Err(error) => return error_response(&args, error),
    };

    let management_args = ManagementNodeMetricsHistoryArgs {
        subnet_id: bounded.subnet_id,
        start_at_timestamp_nanos: bounded.start_at_timestamp_nanos,
    };

    let response = Call::bounded_wait(MANAGEMENT_CANISTER_ID, "node_metrics_history")
        .with_arg(management_args)
        .await;

    match response {
        Ok(response) => match response.candid::<ManagementNodeMetricsHistoryResult>() {
            Ok(raw) => normalize_response(&bounded, raw),
            Err(error) => error_response(
                &bounded,
                NodeMetricsError {
                    code: "MANAGEMENT_CANISTER_DECODE_FAILED".to_string(),
                    message: error.to_string(),
                },
            ),
        },
        Err(error) => error_response(
            &bounded,
            NodeMetricsError {
                code: "MANAGEMENT_CANISTER_CALL_FAILED".to_string(),
                message: error.to_string(),
            },
        ),
    }
}

#[update]
async fn sample_tokenomics_snapshot() -> SampleTokenomicsSnapshotResponse {
    let sampled_at_timestamp_seconds = now_seconds();
    let week_key = iso_week_key(sampled_at_timestamp_seconds);
    if let Some(existing) = TOKENOMICS_SNAPSHOTS
        .with(|snapshots| snapshots.borrow().get(&week_key).and_then(decode_snapshot))
    {
        return SampleTokenomicsSnapshotResponse {
            partial: existing.partial,
            errors: existing.errors.clone(),
            snapshot: Some(existing),
        };
    }

    let metrics_response = Call::bounded_wait(nns_governance_canister_id(), "get_metrics").await;
    let metrics = match metrics_response {
        Ok(response) => match response.candid::<GovernanceMetricsResult>() {
            Ok(GovernanceMetricsResult::Ok(metrics)) => metrics,
            Ok(GovernanceMetricsResult::Err(error)) => {
                let err = HistorianError {
                    code: "GOVERNANCE_METRICS_ERROR".to_string(),
                    message: error.error_message,
                };
                return SampleTokenomicsSnapshotResponse {
                    snapshot: None,
                    partial: true,
                    errors: vec![err],
                };
            }
            Err(error) => {
                let err = HistorianError {
                    code: "GOVERNANCE_METRICS_DECODE_FAILED".to_string(),
                    message: error.to_string(),
                };
                return SampleTokenomicsSnapshotResponse {
                    snapshot: None,
                    partial: true,
                    errors: vec![err],
                };
            }
        },
        Err(error) => {
            let err = HistorianError {
                code: "GOVERNANCE_METRICS_CALL_FAILED".to_string(),
                message: error.to_string(),
            };
            return SampleTokenomicsSnapshotResponse {
                snapshot: None,
                partial: true,
                errors: vec![err],
            };
        }
    };

    let mut errors = vec![];
    let reward_event = read_reward_event(&mut errors).await;
    let snapshot = store_snapshot(snapshot_from_metrics(
        sampled_at_timestamp_seconds,
        metrics,
        reward_event,
        errors,
    ));
    SampleTokenomicsSnapshotResponse {
        partial: snapshot.partial,
        errors: snapshot.errors.clone(),
        snapshot: Some(snapshot),
    }
}

#[query]
fn get_latest_tokenomics_snapshot() -> Option<TokenomicsSnapshot> {
    all_snapshots()
        .into_iter()
        .max_by_key(|snapshot| snapshot.sampled_at_timestamp_seconds)
}

#[query]
fn list_tokenomics_snapshots(query: TokenomicsSnapshotQuery) -> TokenomicsSnapshotPage {
    let limit = query
        .limit
        .unwrap_or(TOKENOMICS_QUERY_LIMIT_DEFAULT)
        .min(TOKENOMICS_QUERY_LIMIT_MAX) as usize;
    let offset = cursor_to_offset(query.cursor);
    let mut snapshots: Vec<_> = all_snapshots()
        .into_iter()
        .filter(|snapshot| {
            query
                .start_at_timestamp_seconds
                .map(|start| snapshot.sampled_at_timestamp_seconds >= start)
                .unwrap_or(true)
                && query
                    .end_at_timestamp_seconds
                    .map(|end| snapshot.sampled_at_timestamp_seconds <= end)
                    .unwrap_or(true)
        })
        .collect();
    snapshots.sort_by_key(|snapshot| snapshot.sampled_at_timestamp_seconds);
    let total = snapshots.len();
    let page: Vec<_> = snapshots.into_iter().skip(offset).take(limit).collect();
    let next = offset + page.len();
    TokenomicsSnapshotPage {
        snapshots: page,
        next_cursor: if next < total {
            Some(offset_to_cursor(next))
        } else {
            None
        },
    }
}

ic_cdk::export_candid!();

#[cfg(test)]
mod tests {
    use super::*;

    fn principal(id: u8) -> Principal {
        Principal::from_slice(&[id])
    }

    fn clear_tokenomics_snapshots_for_test() {
        TOKENOMICS_SNAPSHOTS.with(|snapshots| {
            let keys: Vec<_> = snapshots
                .borrow()
                .iter()
                .map(|entry| *entry.key())
                .collect();
            let mut snapshots = snapshots.borrow_mut();
            for key in keys {
                snapshots.remove(&key);
            }
        });
    }

    fn tokenomics_snapshot(sampled_at_timestamp_seconds: u64) -> TokenomicsSnapshot {
        TokenomicsSnapshot {
            sampled_at_timestamp_seconds,
            governance_metrics_timestamp_seconds: Some(sampled_at_timestamp_seconds - 1),
            total_supply_e8s: Some(1_000),
            total_maturity_e8s_equivalent: Some(2_000),
            total_staked_maturity_e8s_equivalent: Some(3_000),
            total_maturity_disbursements_in_progress_e8s_equivalent: Some(4_000),
            total_staked_e8s: Some(5_000),
            total_locked_e8s: Some(6_000),
            below_voting_threshold_staked_e8s: Some(7_000),
            min_delay_band_staked_e8s: Some(8_000),
            middle_delay_band_staked_e8s: Some(9_000),
            max_delay_band_staked_e8s: Some(10_000),
            dissolve_delay_bucket_granularity_seconds: HALF_YEAR_SECONDS,
            reward_event: None,
            icp_burned_total_e8s: None,
            icp_burned_week_delta_e8s: None,
            provenance: vec![Provenance {
                source: "NNS Governance".to_string(),
                method: "get_metrics".to_string(),
                detail: "test".to_string(),
            }],
            partial: false,
            errors: vec![],
        }
    }

    #[test]
    fn rejects_large_windows() {
        let args = NodeMetricsHistoryArgs {
            subnet_id: principal(1),
            start_at_timestamp_nanos: 0,
            end_at_timestamp_nanos: MAX_WINDOW_NANOS + 1,
        };
        assert_eq!(bounded_args(args).unwrap_err().code, "WINDOW_TOO_LARGE");
    }

    #[test]
    fn rejects_invalid_time_ranges() {
        let args = NodeMetricsHistoryArgs {
            subnet_id: principal(1),
            start_at_timestamp_nanos: 10,
            end_at_timestamp_nanos: 10,
        };
        assert_eq!(bounded_args(args).unwrap_err().code, "INVALID_TIME_RANGE");
    }

    #[test]
    fn decodes_and_normalizes_management_result_shape() {
        let args = NodeMetricsHistoryArgs {
            subnet_id: principal(1),
            start_at_timestamp_nanos: 0,
            end_at_timestamp_nanos: 200,
        };
        let node_id = principal(2);
        let response = normalize_response(
            &args,
            vec![ManagementNodeMetricsHistorySample {
                timestamp_nanos: 100,
                node_metrics: vec![ManagementNodeMetrics {
                    node_id,
                    num_blocks_proposed_total: 10,
                    num_block_failures_total: 1,
                }],
            }],
        );
        assert_eq!(response.records.len(), 1);
        assert_eq!(response.records[0].timestamp_nanos, 100);
        assert_eq!(response.records[0].node_id, node_id);
        assert_eq!(response.records[0].num_blocks_proposed_total, 10);
        assert_eq!(response.records[0].num_block_failures_total, 1);
        assert!(!response.partial);
    }

    #[test]
    fn management_decode_target_has_no_fake_records_wrapper() {
        #[derive(CandidType, Deserialize, Clone, Debug, PartialEq, Eq)]
        struct FakeRawNodeMetricsHistoryResponse {
            records: Vec<NodeMetricsHistoryRecord>,
        }

        let fixture: ManagementNodeMetricsHistoryResult =
            vec![ManagementNodeMetricsHistorySample {
                timestamp_nanos: 100,
                node_metrics: vec![ManagementNodeMetrics {
                    node_id: principal(2),
                    num_blocks_proposed_total: 10,
                    num_block_failures_total: 1,
                }],
            }];
        let bytes = candid::encode_one(fixture).expect("encode fixture");
        assert!(candid::decode_one::<ManagementNodeMetricsHistoryResult>(&bytes).is_ok());
        assert!(candid::decode_one::<FakeRawNodeMetricsHistoryResponse>(&bytes).is_err());
    }

    #[test]
    fn filters_samples_after_end_timestamp() {
        let args = NodeMetricsHistoryArgs {
            subnet_id: principal(1),
            start_at_timestamp_nanos: 10,
            end_at_timestamp_nanos: 20,
        };
        let response = normalize_response(
            &args,
            vec![
                ManagementNodeMetricsHistorySample {
                    timestamp_nanos: 9,
                    node_metrics: vec![ManagementNodeMetrics {
                        node_id: principal(2),
                        num_blocks_proposed_total: 1,
                        num_block_failures_total: 0,
                    }],
                },
                ManagementNodeMetricsHistorySample {
                    timestamp_nanos: 10,
                    node_metrics: vec![ManagementNodeMetrics {
                        node_id: principal(2),
                        num_blocks_proposed_total: 2,
                        num_block_failures_total: 1,
                    }],
                },
                ManagementNodeMetricsHistorySample {
                    timestamp_nanos: 21,
                    node_metrics: vec![ManagementNodeMetrics {
                        node_id: principal(2),
                        num_blocks_proposed_total: 3,
                        num_block_failures_total: 2,
                    }],
                },
            ],
        );
        assert_eq!(response.records.len(), 1);
        assert_eq!(response.records[0].timestamp_nanos, 10);
        assert!(!response.partial);
    }

    #[test]
    fn truncates_large_normalized_responses() {
        let args = NodeMetricsHistoryArgs {
            subnet_id: principal(1),
            start_at_timestamp_nanos: 0,
            end_at_timestamp_nanos: MAX_WINDOW_NANOS,
        };
        let raw = (0..=MAX_RECORDS)
            .map(|index| ManagementNodeMetricsHistorySample {
                timestamp_nanos: index as u64,
                node_metrics: vec![ManagementNodeMetrics {
                    node_id: principal(2),
                    num_blocks_proposed_total: index as u64,
                    num_block_failures_total: 0,
                }],
            })
            .collect();
        let response = normalize_response(&args, raw);
        assert_eq!(response.records.len(), MAX_RECORDS);
        assert!(response.partial);
        assert_eq!(response.errors[0].code, "RESPONSE_TRUNCATED");
    }

    #[test]
    fn normalizes_management_error_without_trapping() {
        let args = NodeMetricsHistoryArgs {
            subnet_id: principal(1),
            start_at_timestamp_nanos: 10,
            end_at_timestamp_nanos: 20,
        };
        let response = error_response(
            &args,
            NodeMetricsError {
                code: "MANAGEMENT_CANISTER_REJECT".to_string(),
                message: "unavailable".to_string(),
            },
        );
        assert!(response.partial);
        assert_eq!(response.errors[0].code, "MANAGEMENT_CANISTER_REJECT");
    }

    #[test]
    fn stores_first_tokenomics_sample_and_deduplicates_same_week() {
        clear_tokenomics_snapshots_for_test();
        let first = store_snapshot(tokenomics_snapshot(WEEK_SECONDS * 10 + 1));
        let second = store_snapshot(tokenomics_snapshot(WEEK_SECONDS * 10 + 20));
        let page = list_tokenomics_snapshots(TokenomicsSnapshotQuery {
            start_at_timestamp_seconds: None,
            end_at_timestamp_seconds: None,
            limit: None,
            cursor: None,
        });
        assert_eq!(page.snapshots.len(), 1);
        assert_eq!(first.sampled_at_timestamp_seconds, WEEK_SECONDS * 10 + 1);
        assert_eq!(
            page.snapshots[0].sampled_at_timestamp_seconds,
            second.sampled_at_timestamp_seconds
        );
    }

    #[test]
    fn prunes_tokenomics_retention_to_five_year_weekly_window() {
        clear_tokenomics_snapshots_for_test();
        for week in 0..(TOKENOMICS_RETENTION_SAMPLES as u64 + 4) {
            store_snapshot(tokenomics_snapshot(week * WEEK_SECONDS + 1));
        }
        let page = list_tokenomics_snapshots(TokenomicsSnapshotQuery {
            start_at_timestamp_seconds: None,
            end_at_timestamp_seconds: None,
            limit: Some(TOKENOMICS_QUERY_LIMIT_MAX),
            cursor: None,
        });
        assert_eq!(all_snapshots().len(), TOKENOMICS_RETENTION_SAMPLES);
        assert_eq!(
            page.snapshots[0].sampled_at_timestamp_seconds,
            4 * WEEK_SECONDS + 1
        );
    }

    #[test]
    fn paginates_tokenomics_snapshots_with_hard_limit() {
        clear_tokenomics_snapshots_for_test();
        for week in 0..5 {
            store_snapshot(tokenomics_snapshot(week * WEEK_SECONDS + 1));
        }
        let first = list_tokenomics_snapshots(TokenomicsSnapshotQuery {
            start_at_timestamp_seconds: None,
            end_at_timestamp_seconds: None,
            limit: Some(2),
            cursor: None,
        });
        assert_eq!(first.snapshots.len(), 2);
        assert!(first.next_cursor.is_some());
        let second = list_tokenomics_snapshots(TokenomicsSnapshotQuery {
            start_at_timestamp_seconds: None,
            end_at_timestamp_seconds: None,
            limit: Some(104),
            cursor: first.next_cursor,
        });
        assert_eq!(second.snapshots.len(), 3);
        assert!(second.next_cursor.is_none());
    }

    #[test]
    fn derives_dissolve_delay_bands_from_half_year_buckets() {
        let dissolving = vec![(0, 100.0), (1, 200.0), (2, 300.0), (15, 400.0), (16, 500.0)];
        let not_dissolving = vec![(1, 20.0), (7, 30.0), (16, 50.0)];
        let (below, min, middle, max, errors) =
            derive_dissolve_delay_bands(111, &dissolving, &not_dissolving);
        assert_eq!(below, Some(111));
        assert_eq!(min, Some(220));
        assert_eq!(middle, Some(730));
        assert_eq!(max, Some(550));
        assert!(errors.is_empty());
    }

    #[test]
    fn missing_dissolve_delay_buckets_produce_zero_safely() {
        let (below, min, middle, max, errors) = derive_dissolve_delay_bands(0, &[], &[]);
        assert_eq!(below, Some(0));
        assert_eq!(min, Some(0));
        assert_eq!(middle, Some(0));
        assert_eq!(max, Some(0));
        assert!(errors.is_empty());
    }

    #[test]
    fn dissolve_delay_band_derivation_saturates_overflow() {
        let buckets = vec![(16, u64::MAX as f64), (16, u64::MAX as f64)];
        let (_, _, _, max, errors) = derive_dissolve_delay_bands(0, &buckets, &[]);
        assert_eq!(max, Some(u64::MAX));
        assert_eq!(errors[0].code, "DISSOLVE_DELAY_BAND_OVERFLOW");
    }

    #[test]
    fn snapshot_without_reward_event_is_partial_only_for_recorded_errors() {
        let metrics = GovernanceCachedMetrics {
            total_maturity_e8s_equivalent: 1,
            not_dissolving_neurons_e8s_buckets: vec![],
            total_supply_icp: 10,
            total_staked_e8s: 2,
            total_locked_e8s: 3,
            total_staked_maturity_e8s_equivalent: 4,
            neurons_with_less_than_6_months_dissolve_delay_e8s: 5,
            dissolving_neurons_e8s_buckets: vec![],
            timestamp_seconds: 6,
            total_maturity_disbursements_in_progress_e8s_equivalent: 7,
        };
        let snapshot = snapshot_from_metrics(8, metrics, None, vec![]);
        assert!(snapshot.reward_event.is_none());
        assert!(snapshot.partial);
        assert_eq!(snapshot.total_supply_e8s, Some(1_000_000_000));
        assert_eq!(snapshot.errors[0].code, "ICP_BURNED_UNAVAILABLE");
    }

    #[test]
    fn candid_surface_marks_historian_method_as_update() {
        let did = include_str!("../historian.did");
        assert!(did.contains(
            "get_node_metrics_history : (NodeMetricsHistoryArgs) -> (NodeMetricsHistoryResponse);"
        ));
        assert!(
            did.contains("sample_tokenomics_snapshot : () -> (SampleTokenomicsSnapshotResponse);")
        );
        assert!(
            did.contains("get_latest_tokenomics_snapshot : () -> (opt TokenomicsSnapshot) query;")
        );
        assert!(did.contains(
            "list_tokenomics_snapshots : (TokenomicsSnapshotQuery) -> (TokenomicsSnapshotPage) query;"
        ));
        assert!(!did.contains("get_node_metrics_history : query"));
    }
}
