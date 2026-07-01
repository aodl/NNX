# Proposal Analysis

This directory contains the NNX proposal-analysis domain layer. It analyses NNS proposals using only normalized data loaded through the NNX query facade.

Phase 1 supports deterministic checks for:

- subnet membership changes;
- subnet creation;
- removing nodes from subnets;
- API boundary node add/remove proposals;
- node references across currently open proposals;
- DFINITY node-provider before/after counts;
- diversity, concentration, and Registry GPS distance context.

The UI consumes normalized analysis objects only. UI modules must not parse raw Candid variants, Registry keys, protobuf records, principal bytes, or proposal payload internals.

Analysis is lifecycle-aware:

- pre-execution proposals are checked against current preconditions;
- successfully executed proposals are checked against current postconditions;
- failed or rejected proposals do not receive warnings that their intended state did not happen.

API boundary domain and IPv4 checks use Registry `NodeRecord` fields decoded behind the query facade. NNX does not perform IP-geolocation validation because the IC does not currently expose an onchain IP-triangulation source. Registry GPS and data-center region strings are onchain data-center metadata. Country and continent normalization only interprets those Registry-provided region/country strings with a static mapping; it is not IP geolocation. External tools such as Globalping can be used manually by reviewers.

The DFINITY provider check uses the fixed provider principal from `analysis-policy.js`; it does not infer provider control from display names.

Management-canister node metrics are intentionally out of scope for Phase 1. Add them later behind the query facade before using them in analysis.
