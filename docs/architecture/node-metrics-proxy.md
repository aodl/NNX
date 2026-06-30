# Node Metrics Proxy

`nnx_node_metrics_proxy` is a separate Rust canister from `nnx_frontend`.
`nnx_frontend` remains a certified static asset canister only.

The proxy exposes one browser-callable NNX update method:

```candid
get_node_metrics_history : (NodeMetricsHistoryArgs) -> (NodeMetricsHistoryResponse);
```

It is intentionally an update method because the IC management canister
`node_metrics_history` method is canister-only and experimental. The proxy calls
the management canister with the official management argument shape only:

```candid
record {
  subnet_id : principal;
  start_at_timestamp_nanos : nat64;
}
```

The public NNX request also includes `end_at_timestamp_nanos`; that field is not
sent to the management canister. It is used only by the proxy for validation,
window bounding, and filtering returned samples.

The management result is a vector of timestamped samples:

```candid
vec record {
  timestamp_nanos : nat64;
  node_metrics : vec record {
    node_id : principal;
    num_blocks_proposed_total : nat64;
    num_block_failures_total : nat64;
  };
}
```

The proxy flattens that result into a normalized frontend shape:

```js
{
  subnetId,
  startAtTimestampNanos,
  endAtTimestampNanos,
  records: [
    { nodeId, timestampNanos, numBlocksProposedTotal, numBlockFailuresTotal }
  ],
  partial,
  errors
}
```

Bounds:

- maximum time window: 24 hours
- maximum normalized records returned: 20,000
- normal errors return typed `errors` with `partial: true`; they do not trap
- invalid time ranges return `INVALID_TIME_RANGE`
- too-large windows return `WINDOW_TOO_LARGE`
- management rejects return `MANAGEMENT_CANISTER_CALL_FAILED`
- management response decode failures return `MANAGEMENT_CANISTER_DECODE_FAILED`
- response truncation returns `RESPONSE_TRUNCATED` with `partial: true`
- empty successful management results return `partial: false` and `records: []`

The proxy has no historian state and no durable dashboard data cache. If caching
is added later, it must document fixed bounds and eviction behavior.

Frontend discovery is network-aware. `PUBLIC_CANISTER_ID:nnx_node_metrics_proxy`
or `NNX_NODE_METRICS_PROXY_CANISTER_ID` wins when explicitly set. Otherwise the
frontend build uses only the selected `ICP_NETWORK` or `ICP_ENV` mapping. If no
network is selected, generated `frontend-env.json` writes `null` for the proxy
ID rather than guessing from local or mainnet mappings.

Node-health signal policy:

- `unavailable`: no usable subnet metrics response, proxy missing, proxy error,
  or no usable records for the whole subnet/window
- `inactive_or_no_block_signal`: a node has no records while other subnet nodes
  have records, or has at least two records with zero proposed-block delta while
  other subnet nodes show activity
- `insufficient_data`: one usable sample, or sample size below threshold when
  the inactive/no-block rule does not apply
- `elevated_failure_signal`: failed-block delta or failure rate exceeds policy
  thresholds
- `healthy_signal`: otherwise

Counters are cumulative. NNX sorts each node's records by timestamp, computes
pairwise deltas, and treats decreases as counter resets by adding the current
post-reset value and setting `counterResetObserved: true`.

Local deploy flow:

```sh
icp network start -d
ICP_WASM_OUTPUT_PATH=/tmp/nnx_frontend_test.wasm ./tools/scripts/icp-build-canister nnx-frontend nnx_frontend
ICP_WASM_OUTPUT_PATH=/tmp/nnx_node_metrics_proxy_test.wasm ./tools/scripts/icp-build-canister nnx-node-metrics-proxy nnx_node_metrics_proxy
icp deploy
npm run smoke:node-metrics-proxy -- --network local --subnet-id <subnet-principal>
```

Do not use `dfx`. Do not add application data APIs to `nnx_frontend`.
