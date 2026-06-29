# Network Nexus (NNX)

Network Nexus is a first prototype of an NNS-governance-focused onchain dashboard for the Internet Computer.

The initial scope is intentionally small: `/` lists open NNS proposals that can still be voted on and groups IC subnets by node count, `/subnet/{subnet_id}` shows Registry-derived subnet details and node locations, while `/neuron/{neuron_id}` shows details for a decimal `nat64` NNS neuron ID. The browser app queries NNS Governance, Registry, and CMC through the query facade.

## Tooling

This repository uses `icp-cli` and `icp.yaml`. It does not use `dfx` or `dfx.json`.

Install `icp-cli` and the Rust Wasm target before deploying:

```bash
npm install -g @icp-sdk/icp-cli @icp-sdk/ic-wasm
rustup target add wasm32-unknown-unknown
```

## Setup

```bash
npm ci
npm run build:frontend
cargo test
icp deploy nnx_frontend --environment local
```

For local deployment, start the managed local network first if it is not already running:

```bash
icp network start -d
```

## Main Route

```text
/                         open NNS proposals
/neuron/{neuron_id}
/proposal/{proposal_id}   NNS proposal detail
/subnet/{subnet_id}       IC subnet detail and node map
```

The landing page reads NNS Governance `list_proposals` filtered to `PROPOSAL_REWARD_STATUS_ACCEPT_VOTES` as the source of truth for proposals still accepting votes, Registry subnet records as the source of truth for subnet membership/node counts, and CMC subnet type assignments for placement labels such as `Fiduciary`. Malformed routes are handled by the Rust certified asset canister as HTTP 404. Valid-shaped but non-existent neuron IDs are detected client-side after querying NNS Governance.

## Query Architecture

Application and UI modules do not import actors, agents, or Candid declarations directly. They depend on `createIcQueryFacade`.

The current backend is `agent-query-backend.js`, which uses `@icp-sdk/core/agent` and checked-in reduced NNS Governance, Registry, and CMC declarations. It calls Governance `list_neurons`, `list_known_neurons`, `list_node_providers`, `list_proposals`, and `get_proposal_info`, Registry topology queries, raw Registry `subnet_list` discovery, and CMC `get_subnet_types_to_subnets`. A future `ic-query` backend can replace this module without changing UI or domain call sites.

Mainnet canister IDs:

```text
NNS Governance  rrkah-fqaaa-aaaaa-aaaaq-cai
NNS Registry    rwlgt-iiaaa-aaaaa-aaaaa-cai
CMC             rkp4c-7iaaa-aaaaa-aaaca-cai
```

## Onchain Data Proxy

The first NNX onchain data proxy lives behind `createIcQueryFacade` and returns normalized plain JavaScript objects. UI and domain code should call facade methods only:

```js
const topology = await queryFacade.getIcTopology();
const providers = await queryFacade.getIcNodeProviders();
const subnet = await queryFacade.getIcSubnet({ subnetId: 'known-subnet-id' });
const subnetDetail = await queryFacade.getIcSubnetDetails({ subnetId: 'known-subnet-id' });
const { subnets, warnings } = await queryFacade.getIcSubnets({
  subnetIds: ['known-subnet-id'],
});
const { countsBySubnetId } = await queryFacade.getIcSubnetNodeCounts({
  subnetIds: ['known-subnet-id'],
});
const { labelsBySubnetId } = await queryFacade.getCmcSubnetLabels();
await queryFacade.refreshIcTopology();
queryFacade.clearTopologyCache();
```

`getIcTopology()` uses Candid-safe reads:

1. Governance `list_node_providers()`.
2. Registry `get_node_operators_and_dcs_of_node_provider(providerPrincipal)` for each provider.
3. Normalization into node providers, node operators, and data centers.

Candid-safe subnet reads are available when callers already know subnet IDs:

- `getIcSubnet({ subnetId })` reads one Registry `get_subnet` record and returns a normalized subnet or `null` for Registry `Err`.
- `getIcSubnetDetails({ subnetId })` reads the Registry subnet record, raw Registry node records, Governance node providers, Registry node operators, and Registry data center GPS metadata to return onchain-derived node locations for `/subnet/{subnet_id}`.
- `getIcSubnets({ subnetIds })` reads known subnet IDs with bounded concurrency and returns `{ subnets, warnings }`.
- `getIcSubnetNodeCounts({ subnetIds })` returns `{ countsBySubnetId, warnings }` for display code that only needs node counts and basic subnet metadata.

Example:

```js
const { countsBySubnetId, warnings } = await queryFacade.getIcSubnetNodeCounts({
  subnetIds: ['known-subnet-id'],
});
```

`getIcSubnets()` without `subnetIds` discovers the complete subnet ID list through the Registry canister's raw protobuf `get_value` query for the `subnet_list` key, then reads each subnet through Candid-safe `get_subnet`. The raw protobuf code is isolated in `raw-registry-client.js`; UI and domain modules still receive normalized plain JavaScript objects only.

If raw Registry discovery is unavailable in a future backend, `getIcSubnets()` without IDs must fail clearly with `RAW_REGISTRY_UNAVAILABLE`, not return an empty all-subnet result.

`getCmcSubnetLabels()` reads CMC `get_subnet_types_to_subnets()` and `get_default_subnets()`, then normalizes them into `{ labelsBySubnetId, defaultSubnetIds, publicSubnetIds, warnings }`. CMC labels are kept separate from Registry subnet type: CMC labels are user-facing placement labels such as `Fiduciary` or other CMC-configured subnet types, while Registry type remains `system`, `application`, `verified_application`, or `cloud_engine`.

The landing page uses `subnet-loader.js` to merge Registry subnet records with CMC labels, group subnets by `nodeCount`, and render expandable node-count groups. Subnets in the CMC default subnet list or assigned to a CMC subnet type are shown as Permissionless; all others are shown as Unknown. CMC labels are displayed only when the CMC assigns one. UI modules do not import the CMC actor, Registry actor, raw Registry key names, protobuf helpers, or principal utilities.

Topology cache behavior:

- In-memory only, no `localStorage`.
- Default TTL is 60 seconds.
- Concurrent `getIcTopology()` calls share the same in-flight request.
- `refreshIcTopology()` bypasses the cache.
- `clearTopologyCache()` invalidates cached and in-flight topology state.

Topology errors use `IcTopologyError` with stable codes such as `GOVERNANCE_CALL_FAILED`, `REGISTRY_CALL_FAILED`, `REGISTRY_RESPONSE_ERR`, `PARTIAL_TOPOLOGY`, `VALIDATION_FAILED`, and `RAW_REGISTRY_UNAVAILABLE`. A total provider read failure throws an `IcTopologyError`; partial provider failures return a partial topology with structured warnings.

Node location modeling must be derived through the topology relationship, not as direct node fields:

```text
node -> node operator -> data center -> gps
```

The subnet detail globe uses checked-in Natural Earth 110m land geometry served by the frontend canister from `map/ne_110m_land.geojson`. This file is only the visual basemap. Subnet membership, node-to-operator relationships, data center metadata, GPS coordinates, and CMC labels remain derived from onchain Registry, Governance, and CMC queries.

Normal test commands:

```bash
npm run test:frontend-unit
cargo test --workspace
npm run build:frontend
```

## NNS Topic Generation

NNS topic metadata is generated from upstream `governance.proto` in the DFINITY IC repository:

```bash
npm run generate:nns-topics
```

Do not manually maintain the full topic list. The app keeps only a small policy overlay for fallback semantics that are not fully discoverable from the enum alone.

By default, generation must read the live upstream `governance.proto`. If that fetch fails, the script will use `tools/cache/governance.proto` as a pinned fallback when the cache file exists and will print a warning that the cache was used. If the fetch fails and no pinned cache exists, generation exits non-zero.

The embedded proto snapshot is only an emergency fallback. To allow it explicitly, run with:

```bash
NNX_ALLOW_EMBEDDED_TOPIC_FALLBACK=1 npm run generate:nns-topics
```

## Limitations

Private neurons show controller as `Anonymous`.

Private hotkeys and followees show `Private`.

Non-existent valid-shaped neuron IDs are detected client-side after the NNS query.

The guarantee proof is structural, conservative, and bounded by max transitive depth. Every effective followee must resolve to alpha-vote, omega-vote, or omega-reject, except that omega-reject with at most one other effective followee is treated as guaranteed because a reject breaks a tie. Other majority logic and voting power are intentionally ignored.
