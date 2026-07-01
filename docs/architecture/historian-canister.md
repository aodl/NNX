# Historian Canister

The historian is a separate canister for bounded `node_metrics_history` access
and bounded historical sampling. It stores tokenomics snapshots in stable memory
with explicit retention and provenance. Future periodic sampling must be
bounded, paged, provenance-rich, and tested before being enabled.

The public method is intentionally an update method:

```candid
get_node_metrics_history : (NodeMetricsHistoryArgs) -> (NodeMetricsHistoryResponse);
```

Tokenomics methods:

```candid
sample_tokenomics_snapshot : () -> (SampleTokenomicsSnapshotResponse);
get_latest_tokenomics_snapshot : () -> (opt TokenomicsSnapshot) query;
list_tokenomics_snapshots : (TokenomicsSnapshotQuery) -> (TokenomicsSnapshotPage) query;
```

`sample_tokenomics_snapshot` is manual only. No automatic timer is enabled yet.
It samples NNS Governance `get_metrics` and best-effort
`get_latest_reward_event`, stores at most one snapshot per week, and keeps a
five-year weekly retention window of 260 samples. Query pages are capped at 104
samples.

The IC management canister `node_metrics_history` method is canister-only and
experimental. The historian calls the management canister with the official
management argument shape:

```candid
record {
  subnet_id : principal;
  start_at_timestamp_nanos : nat64;
}
```

The public NNX request also includes `end_at_timestamp_nanos`; that field is not
sent to the management canister. It is used for validation, window bounding, and
filtering returned samples.

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

Frontend discovery prefers `PUBLIC_CANISTER_ID:nnx_historian` or
`NNX_HISTORIAN_CANISTER_ID`. The old node-metrics-proxy env names are accepted
only as one-release compatibility fallbacks.

The historian should store data only when NNX needs bounded historical or
derived time-series data that system canisters do not already expose in a usable
way.

Tokenomics snapshot source policy:

- maturity, staked maturity, total staked ICP, total locked ICP, total supply,
  and dissolve-delay bucket inputs come from NNS Governance cached metrics
- dissolve-delay buckets are half-year buckets; UI copy must not imply day-level
  precision
- below-voting-threshold stake uses
  `neurons_with_less_than_6_months_dissolve_delay_e8s`
- ICP burned is unavailable until a bounded scanner can derive it from ICP
  Ledger/index/archive or another allowed system canister source
- Dashboard APIs, `ic-api.internetcomputer.org`, CSV snapshots, scraping, and
  offchain indexers must not be used

Good future candidates:

- periodic derived node-health signal summaries, if management-canister history
  retention or query cost is insufficient
- proposal-analysis summary snapshots, if NNX wants to show how analysis changed
  while a proposal was pending
- derived topology or concentration snapshots, if Registry version history is
  insufficient for the UX or reporting need
- NNX operational telemetry such as historian health, query failures, partial-data
  incidents, and analysis runtime timings
- onchain-derived alternative-node candidate snapshots, only after NNX has a
  bounded onchain unassigned-node inventory query and a clear retention need

Poor candidates:

- raw NNS proposal mirror
- raw Registry mirror
- dashboard/API mirror
- offchain geolocation or Globalping-derived validation state
- current state cache with no retention or provenance policy

The historian may store derived records with explicit provenance fields:

- source canister and method
- source Registry version or proposal ID where applicable
- collection timestamp
- derivation code version
- partial-data/error flags

It must not store private keys, secrets, scraped data, dashboard API data, CSV
inventory snapshots, or IP geolocation validation state.

Retention should be explicit per record family, bounded by stable-memory budget,
and enforced by pruning. Stable memory should use versioned records and indexes
that can be migrated incrementally on upgrade. Public query APIs must be paged
with deterministic cursors and maximum page sizes.

Example query shape:

```candid
type HistorianQuery = record {
  kind : text;
  start_at_timestamp_nanos : nat64;
  end_at_timestamp_nanos : nat64;
  cursor : opt blob;
  limit : nat32;
};
```

The historian is downstream from system canisters. It is not a dashboard API
mirror and should not mirror unbounded current state. Tests should cover
retention pruning, pagination, provenance, stable-memory upgrade compatibility,
partial-data records, and API bounds.

## Candidate-node analysis note

Reviewer-grade alternative node suggestions require an onchain inventory of
unassigned nodes plus complete Registry node/operator/data-center metadata. The
current query facade loads node records for proposal-referenced or
subnet-referenced node IDs; it does not yet expose a complete unassigned-node
inventory. Until that bounded Registry inventory API exists, NNX should not
display candidate replacements, because doing so would either be incomplete or
would require prohibited offchain inventory sources.
