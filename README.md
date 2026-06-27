# Network Nexus (NNX)

Network Nexus is a first prototype of an NNS-governance-focused onchain dashboard for the Internet Computer.

The initial scope is intentionally small: `/` lists open NNS proposals that can still be voted on, and `/neuron/{neuron_id}` shows details for a decimal `nat64` NNS neuron ID. The browser app queries NNS Governance directly through the query facade.

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

The current backend is `agent-query-backend.js`, which uses `@icp-sdk/core/agent` and the checked-in NNS Governance declarations to call `list_neurons`, `list_known_neurons`, `get_pending_proposals`, and `get_proposal_info`. A future `ic-query` backend can replace this module without changing UI or domain call sites.

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

The guarantee proof is structural, conservative, and bounded by max transitive depth. Every effective followee must resolve to alpha-vote, omega-vote, or omega-reject; majority logic and voting power are intentionally ignored.
