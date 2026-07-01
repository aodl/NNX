# AGENTS.md

## Purpose

This file is durable operating memory for Codex when working in NNX. Read it
before making changes. Keep it concise and update it when durable project
guidance changes.

## Self-maintenance rule

Codex may update AGENTS.md whenever it learns stable repo-specific guidance that
should persist across sessions.

Update AGENTS.md for:

- recurring user corrections
- architecture invariants
- deployment authority or canister IDs
- required test/check commands
- forbidden data sources, tools, or dependencies
- repo-wide naming decisions
- repeated pitfalls or bug classes
- staging or production workflow changes

Do not add:

- secrets, private keys, PEMs, seed phrases, or private identity material
- one-off local paths or transient command failures
- long chat transcripts
- proposal-specific observations unless they reveal a reusable analyzer rule
- large design details better suited to docs/

Prefer editing existing sections over appending. Keep this file concise, move
long procedures into docs/, and remove stale instructions when replacing them.

## Project summary

NNX is an Internet Computer / NNS governance dashboard.

Architecture:

- Rust certified asset frontend canister.
- Plain browser JavaScript.
- `icp-cli` / `icp.yaml` as committed project config.
- Query-facade boundary for all onchain/system reads.
- No React, TypeScript, Vite, Svelte, Next, DOM emulator, or automated
  browser-test stack.
- No `dfx.json` in source control.

Current routes:

- `/`
- `/proposal/{proposal_id}`
- `/neuron/{neuron_id}`
- `/subnet/{subnet_id}`

Before changing IC-specific code, Candid, `icp.yaml`, certified asset routing, or
browser agent code, fetch and follow the current Internet Computer skills index:

- https://skills.internetcomputer.org/llms.txt
- https://skills.internetcomputer.org/.well-known/skills/index.json

## Architecture invariants

- `nnx_frontend` is a certified static asset canister only.
- `nnx_frontend` must not contain NNX app data APIs, management-canister proxy
  APIs, timers, durable NNX state, or historian state.
- `nnx_historian` is the separate staging canister for
  `node_metrics_history` access and future bounded historical sampling.
- `nnx_historian` is the repo-facing canister/package name for bounded
  `node_metrics_history` access and future bounded historical sampling.
- UI/domain modules consume normalized query-facade/service objects only.
- UI/domain modules must not import actors, agents, generated Candid
  declarations, raw Registry keys, protobuf decode internals, Principal
  internals, certificate logic, management-canister callers, or historian Candid
  directly.
- Keep raw/system/canister details in narrow boundary modules.

## Data-source policy

Allowed validation/data sources:

- NNS Governance
- NNS Registry
- CMC
- raw Registry reads through isolated topology/query modules
- certified state reads through boundary modules
- management-canister `node_metrics_history` through `nnx_historian`

Forbidden validation/data sources:

- dashboard APIs
- `ic-api.internetcomputer.org`
- CSV snapshots
- scraping
- IP geolocation APIs
- automatic Globalping calls
- offchain inventories

Globalping may only be a manual reviewer aid. Its label must say:

```text
Manual external check - Not used by NNX validation
```

## Node/status terminology

Do not use DOWN or DEGRADED labels.

Use only derived signal labels:

- `healthy_signal`
- `elevated_failure_signal`
- `inactive_or_no_block_signal`
- `insufficient_data`
- `unavailable`

These are derived measurements, not canonical node status.

## Proposal-analysis policy

Proposal analysis must be lifecycle-aware. `ProposalStatus` wins over
`ProposalRewardStatus`.

- executed + accepting-votes => `post_execution_success`
- failed + accepting-votes => `post_execution_failed`
- rejected + accepting-votes => `rejected`
- open + accepting-votes => `pre_execution`

Reward status accepting-votes is about rewards/voting reward settlement and must
not override proposal execution status.

Unsupported/unknown proposal actions must not throw. They should produce compact
unsupported analysis.

For supported proposal types, prefer structured
`self_describing_action`/`actionValues` over free text. Free text is fallback
only.

## DFINITY provider rule

DFINITY provider detection must use only this fixed provider principal:

```text
bvcsg-3od6r-jnydw-eysln-aql7w-td5zn-ay5m6-sibd2-jzojt-anwag-mqe
```

Do not infer DFINITY control from display names.

## Frontend artifact rules

- `canisters/frontend/public/index.html` must reference
  `/generated/app.placeholder.js`.
- Generated `app.<hash>.js` bundles must not be tracked or staged.
- `canisters/frontend/public/generated/*` should remain ignored except
  `.gitkeep`.
- `frontend-env.json` and `build-info.json` are generated artifacts and should
  not be committed unless explicitly designed otherwise.
- The Rust frontend canister stamps the generated bundle path at
  asset-collection time.
- The frontend build must not mutate tracked `index.html`.

## Build reproducibility

- `tools/cache/governance.proto` is a committed pinned fallback.
- `npm run build:frontend` must work when upstream `governance.proto` fetch
  fails and the committed cache exists.
- Embedded topic fallback requires `NNX_ALLOW_EMBEDDED_TOPIC_FALLBACK=1`.
- Generated topic metadata must not cause generated frontend bundles to be
  staged.

## Testing policy

Required lightweight checks:

```sh
git diff --check
npm ci --no-fund --no-audit
npm run test:frontend-unit
npm run build:frontend
cargo fmt --all -- --check
cargo test --workspace
cargo build --workspace --target wasm32-unknown-unknown --release
node tools/scripts/check-frontend-artifacts.mjs
node tools/scripts/check-boundaries.mjs
tools/scripts/security-scan
```

Mainnet/read-only smokes when network is available:

```sh
npm run smoke:proposal-analysis:mainnet
npm run smoke:api-boundary-membership -- --network ic --node-id 2vxsx-fae --expect-non-member 2vxsx-fae
```

Historian/node metrics smoke when configured:

```sh
npm run smoke:historian-node-metrics -- --network ic --subnet-id <real-subnet-id>
```

There is intentionally no automated browser-test dependency. Browser behavior is
checked manually through the release checklist.

## Staging deployment authority

Permanent IC staging canisters:

- frontend staging canister: `6h2pa-qiaaa-aaaao-qp4fa-cai`
- historian staging canister: `yo47z-piaaa-aaaac-qg3xa-cai`

Codex may deploy directly to these staging canisters using `dfx` as an operator
tool.

Use dfx identity:

```text
codex-local
```

Rules:

- Use `dfx` only for staging upgrades.
- Do not deploy production.
- Do not create new canisters.
- Do not delete, stop, or reinstall canisters unless explicitly instructed.
- Use upgrade mode for existing installed canisters.
- Never use reinstall unless explicitly instructed.
- Do not commit `dfx.json`.
- Do not commit `.dfx/`, `canister_ids.json`, generated declarations,
  identities, PEMs, or local deployment state.
- If `dfx` requires temporary config, create it outside the repo, for example
  under `/tmp`, and remove it after use.

The committed project remains `icp-cli`/`icp.yaml` based even though staging
upgrades may use `dfx` operationally.

## Production policy

Production canisters are placeholders for now.

Codex must not deploy production without explicit human approval. Codex may
prepare production deployment commands/checklists but must not execute production
deployment autonomously.

## Autonomous staging loop

Codex may autonomously perform this staging loop:

1. Run deployed-mainnet review against staging.
2. Detect misleading analysis, unnecessary warnings, unsupported-but-important
   proposal actions, or missing evidence.
3. Capture fixtures for suspicious proposals.
4. Add failing tests.
5. Fix parser/analyzer/UI copy/data handling.
6. Run full checks.
7. Commit the fix.
8. Build from the clean commit.
9. Deploy to staging with `dfx` using `codex-local`.
10. Verify build-info and frontend-env.
11. Rerun smokes/review.
12. Report results.

Commit before staging deployment when build-info includes `gitCommit`.

## Daily review workflow

Expected daily user prompt:

```text
Please run the NNX deployed-mainnet review against staging.
```

Check the staging frontend canister on IC mainnet and current open NNS
proposals. For any new or changed proposals, determine whether NNX provides
sufficient and accurate analysis on the proposal detail pages. Pay special
attention to lifecycle correctness, unnecessary warnings, misleading data,
unsupported actions that should be supported, and missing onchain/system
evidence.

If you find a bug or misleading analysis, capture a fixture, add a failing test,
fix it, run the full checks, commit, deploy to the staging canisters with `dfx`
using `codex-local`, and report. Do not deploy production.

## Useful docs

- `docs/deployments.md`
- `docs/staging-deploy.md`
- `docs/production-deploy.md`
- `docs/release-checklist.md`
- `docs/architecture/query-boundaries.md`
- `docs/architecture/historian-canister.md`
- `docs/architecture/topic-generation.md`
- `docs/security/frontend-security.md`
- `docs/security/dependency-scanning.md`
