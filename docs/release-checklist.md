# Release Checklist

Before each deployment:

```sh
git diff --check
npm ci --no-fund --no-audit
npm run test:frontend-unit
cargo fmt --all -- --check
cargo test --workspace
npm run build:frontend
cargo build --workspace --target wasm32-unknown-unknown --release
node tools/scripts/check-frontend-artifacts.mjs
node tools/scripts/check-boundaries.mjs
tools/scripts/security-scan
npm run test:e2e
ICP_WASM_OUTPUT_PATH=/tmp/nnx_frontend_test.wasm ./tools/scripts/icp-build-canister nnx-frontend nnx_frontend
ICP_WASM_OUTPUT_PATH=/tmp/nnx_node_metrics_proxy_test.wasm ./tools/scripts/icp-build-canister nnx-node-metrics-proxy nnx_node_metrics_proxy
```

`npm run test:e2e` uses Playwright Chromium and requires the browser system
libraries documented by Playwright for the host OS. In minimal containers, run it
in a browser-capable image or install the missing libraries first.

The node metrics proxy valid-path smoke is manual because local replicas may not
support the experimental management-canister method:

```sh
npm run smoke:node-metrics-proxy -- --network local --subnet-id <subnet-principal>
npm run smoke:node-metrics-proxy -- --network ic --subnet-id <subnet-principal>
```

Certified API-boundary membership smoke uses only certified subnet state for
caller-supplied node IDs. A stable positive member is intentionally not
hardcoded; release operators can provide one with
`NNX_API_BOUNDARY_MEMBER_CANARY_NODE_ID`.

```sh
npm run smoke:api-boundary-membership -- --network ic --node-id <known-non-member> --expect-non-member <known-non-member>
NNX_API_BOUNDARY_MEMBER_CANARY_NODE_ID=<known-boundary-node> npm run smoke:api-boundary-membership -- --network ic --node-id <known-non-member>
NNX_ALLOW_UNSUPPORTED_LOCAL_CERTIFIED_STATE=1 npm run smoke:api-boundary-membership -- --network local --node-id <local-node-id>
```

Verify:

- `canisters/frontend/public/index.html` still references `/generated/app.placeholder.js`
- no generated `app.<hash>.js` bundle is staged
- generated bundles remain ignored except `.gitkeep`
- route smoke and mainnet query smoke pass
- node metrics valid-path smoke returns normalized records, empty records, or
  typed `MANAGEMENT_CANISTER_CALL_FAILED`; it must not trap or return
  `MANAGEMENT_CANISTER_DECODE_FAILED`
- invalid node metrics range still returns typed `INVALID_TIME_RANGE`; this is a
  separate check from the valid management-call path smoke
- API-boundary membership smoke prints `available`, returned member node IDs,
  warnings, and errors; unavailable mainnet certified-state reads are failures
- manual browser smoke passes for WebGL/globe
- `node tools/scripts/check-frontend-artifacts.mjs`
- `node tools/scripts/check-boundaries.mjs`
- `tools/scripts/security-scan`
- generated `/generated/frontend-env.json` contains the deployed
  `nnx_node_metrics_proxy` ID for the active network, or `null` when no network
  or explicit env var was selected during a standalone frontend build

Manual browser smoke:

- `/`: open proposal cards render, analysis badges appear where expected,
  unsupported-action cards are compact, and there are no console errors
- `/proposal/{real proposal id}`: detail, proposal analysis, severity grouping,
  lifecycle mode, state-change section, parser-confidence/manual-review UI, safe
  external link behavior, and no console errors
- `/subnet/{real subnet principal}`: subnet detail, globe/flat map, node list,
  Registry metadata, manual Globalping label, proposed-node highlighting where
  applicable, and no console errors
- `/neuron/{real neuron id}`: neuron page works and vote-guarantee UI uses
  generalized proof wording

Malformed route checks:

- `/subnet/not-a-principal` -> 404
- `/subnet/{valid}/extra` -> 404
- `/proposal/not-a-number` -> 404
- `/neuron/not-a-number` -> 404

Deploy with the repo's `icp-cli` flow. Do not add `dfx.json` or switch to `dfx`.
