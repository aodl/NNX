# Network Nexus (NNX)

Network Nexus is a first prototype of an NNS-governance-focused onchain dashboard for the Internet Computer.

The initial scope is intentionally small: `/` lists open NNS proposals that can still be voted on, and `/neuron/{neuron_id}` shows details for a decimal `nat64` NNS neuron ID. The browser app queries NNS Governance and Registry through the query facade.

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
```

The landing page reads NNS Governance `get_pending_proposals` as the source of truth for open proposals. Malformed routes are handled by the Rust certified asset canister as HTTP 404. Valid-shaped but non-existent neuron IDs are detected client-side after querying NNS Governance.

## Query Architecture

Application and UI modules do not import actors, agents, or Candid declarations directly. They depend on `createIcQueryFacade`.

The current backend is `agent-query-backend.js`, which uses `@icp-sdk/core/agent` and checked-in reduced NNS Governance and Registry declarations. It calls Governance `list_neurons`, `list_known_neurons`, `list_node_providers`, `get_pending_proposals`, and `get_proposal_info`, plus Registry topology queries. A future `ic-query` backend can replace this module without changing UI or domain call sites.

Mainnet canister IDs:

```text
NNS Governance  rrkah-fqaaa-aaaaa-aaaaq-cai
NNS Registry    rwlgt-iiaaa-aaaaa-aaaaa-cai
```

## Onchain Data Proxy

The first NNX onchain data proxy lives behind `createIcQueryFacade` and returns normalized plain JavaScript objects. UI and domain code should call facade methods only:

```js
const topology = await queryFacade.getIcTopology();
const providers = await queryFacade.getIcNodeProviders();
await queryFacade.refreshIcTopology();
queryFacade.clearTopologyCache();
```

`getIcTopology()` uses Candid-safe reads:

1. Governance `list_node_providers()`.
2. Registry `get_node_operators_and_dcs_of_node_provider(providerPrincipal)` for each provider.
3. Normalization into node providers, node operators, and data centers.

Complete subnet and node discovery is not guaranteed in this Candid-safe mode. The Registry declaration includes `get_subnet` and `get_subnet_for_canister` for known-ID reads, but this PR intentionally does not invent a method for listing every subnet and does not decode raw Registry protobuf key/value records. `raw-registry-client.js` is an isolated placeholder that throws `RAW_REGISTRY_UNAVAILABLE` until a later raw Registry implementation or backend/indexer is added.

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
