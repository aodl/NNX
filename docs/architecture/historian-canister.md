# Historian Canister

The historian currently exists in staging as a bounded
`node_metrics_history` access canister. It does not yet persist durable
historical records. Any future sampling/storage must be bounded, paged,
provenance-rich, and tested.

The source tree still contains the transitional `nnx_node_metrics_proxy`
package/canister name. Treat `nnx_historian` as the durable canister name for
deployment policy and new documentation until the source rename is completed.

The historian should store data only when NNX needs bounded historical or
derived time-series data that system canisters do not already expose in a usable
way.

Good future candidates:

- periodic derived node-health signal summaries, if management-canister history
  retention or query cost is insufficient
- proposal-analysis summary snapshots, if NNX wants to show how analysis changed
  while a proposal was pending
- derived topology or concentration snapshots, if Registry version history is
  insufficient for the UX or reporting need
- NNX operational telemetry such as proxy health, query failures, partial-data
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
