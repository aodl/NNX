# AGENTS.md

This repository builds on the Internet Computer.

Before writing or changing any IC-specific code, fetch and follow:

https://skills.internetcomputer.org/llms.txt

Then fetch the current skills index:

https://skills.internetcomputer.org/.well-known/skills/index.json

Fetch the relevant skill files from that index before editing ICP code, Rust canisters, Candid declarations, icp-cli configuration, certified asset routing, or browser agent code.

Do not use `dfx` in this repository. Use `icp-cli` and `icp.yaml`.

The reference architecture is the Jupiter Faucet frontend:

https://github.com/aodl/JUPITER_FAUCET_SUITE/tree/master/canisters/frontend

Follow the same high-level approach:
- Rust certified asset frontend canister.
- Static browser JavaScript bundle.
- Checked-in Candid declarations for external canisters.
- Browser-side query calls to NNS Governance through `@icp-sdk/core/agent`.
- No custom JSON API endpoints for dashboard data.

This project intentionally wraps network/system state reads behind a small query facade so a future `ic-query` backend can replace the current direct-agent backend without changing UI/domain call sites.
