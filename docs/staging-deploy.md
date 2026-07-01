# Staging Deploy

The committed project config remains `icp-cli`/`icp.yaml`. Do not add
`dfx.json`. `dfx` may be used only as an operator tool for upgrade-mode deploys
to the permanent staging canisters:

- frontend: `6h2pa-qiaaa-aaaao-qp4fa-cai`
- historian: `yo47z-piaaa-aaaac-qg3xa-cai`

Use the `codex-local` identity:

```sh
dfx identity use codex-local
dfx identity whoami
dfx identity get-principal
```

Confirm the exact target canisters before building:

```sh
dfx canister --network ic status 6h2pa-qiaaa-aaaao-qp4fa-cai
dfx canister --network ic status yo47z-piaaa-aaaac-qg3xa-cai
```

Build with staging IDs in the frontend environment:

```sh
NNX_DEPLOY_ENVIRONMENT=staging \
NNX_FRONTEND_CANISTER_ID=6h2pa-qiaaa-aaaao-qp4fa-cai \
NNX_HISTORIAN_CANISTER_ID=yo47z-piaaa-aaaac-qg3xa-cai \
NNX_NODE_METRICS_PROXY_CANISTER_ID=yo47z-piaaa-aaaac-qg3xa-cai \
ICP_WASM_OUTPUT_PATH=/tmp/nnx_frontend_staging.wasm \
./tools/scripts/icp-build-canister nnx-frontend nnx_frontend

NNX_DEPLOY_ENVIRONMENT=staging \
NNX_FRONTEND_CANISTER_ID=6h2pa-qiaaa-aaaao-qp4fa-cai \
NNX_HISTORIAN_CANISTER_ID=yo47z-piaaa-aaaac-qg3xa-cai \
NNX_NODE_METRICS_PROXY_CANISTER_ID=yo47z-piaaa-aaaac-qg3xa-cai \
ICP_WASM_OUTPUT_PATH=/tmp/nnx_historian_staging.wasm \
./tools/scripts/icp-build-canister nnx-node-metrics-proxy nnx_node_metrics_proxy
```

If `dfx` requires canister names, create temporary config outside the repo, for
example under `/tmp`, and remove it after use. Never commit `dfx.json`, `.dfx/`,
`canister_ids.json`, generated declarations, identities, PEMs, or local
deployment state.

Upgrade only the exact staging canister IDs:

```sh
dfx canister --network ic install 6h2pa-qiaaa-aaaao-qp4fa-cai \
  --mode upgrade \
  --wasm /tmp/nnx_frontend_staging.wasm

dfx canister --network ic install yo47z-piaaa-aaaac-qg3xa-cai \
  --mode upgrade \
  --wasm /tmp/nnx_historian_staging.wasm
```

Rules:

- Do not create new canisters.
- Do not deploy production.
- Do not stop, delete, or reinstall canisters unless explicitly instructed.
- Use upgrade mode for existing installed canisters.
- Commit before staging deployment when build-info includes `gitCommit`.
