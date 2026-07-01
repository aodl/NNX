# Frontend Security

The frontend treats CSP as defense in depth only. Safe DOM construction,
`textContent`, and URL sanitization are still required for all proposal,
Registry, and historian-returned display fields.

Theme and dashboard UI code must use CSS variables for dark/light modes and
DOM-safe construction. Theme preference may be read from localStorage, but
failure to access localStorage must degrade gracefully. Focus states must remain
visible in both themes, and UI severity must not rely on color alone.

External URLs must be normalized through `safeExternalUrl` before rendering.
Links that open a new tab use `target="_blank"` and `rel="noopener noreferrer"`.

NNX validation inputs are onchain/system-canister data only: NNS Governance, NNS
Registry, CMC, isolated raw Registry reads, certified state reads through
boundary modules, and management-canister `node_metrics_history` through
`nnx_historian`. NNX does not use dashboard APIs, `ic-api.internetcomputer.org`,
offchain APIs, IP geolocation APIs, CSV snapshots, scraping, or Globalping output
as validation evidence. Globalping links are manual reviewer aids only.

Tokenomics pages and home metric cards must not call ICP Dashboard APIs. They
may display historian-backed NNS Governance cached metrics and future
ledger/system-canister derived burn metrics only through the query facade.
