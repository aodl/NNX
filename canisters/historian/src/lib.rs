use candid::{CandidType, Principal};
use ic_cdk::call::Call;
use ic_cdk::update;
use serde::Deserialize;

const MANAGEMENT_CANISTER_ID: Principal = Principal::management_canister();
const MAX_WINDOW_NANOS: u64 = 24 * 60 * 60 * 1_000_000_000;
const MAX_RECORDS: usize = 20_000;

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

ic_cdk::export_candid!();

#[cfg(test)]
mod tests {
    use super::*;

    fn principal(id: u8) -> Principal {
        Principal::from_slice(&[id])
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
    fn candid_surface_marks_historian_method_as_update() {
        let did = include_str!("../historian.did");
        assert!(did.contains(
            "get_node_metrics_history : (NodeMetricsHistoryArgs) -> (NodeMetricsHistoryResponse);"
        ));
        assert!(!did.contains("get_node_metrics_history : query"));
        assert!(!did.contains(") query;"));
    }
}
