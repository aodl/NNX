# Deployments

Machine-readable deployment registry:

- `deployments/staging.json`
- `deployments/production.json`

## Staging

Permanent IC staging canisters:

| Role | Name | Canister ID | URL |
| --- | --- | --- | --- |
| frontend | `nnx_frontend_staging` | `6h2pa-qiaaa-aaaao-qp4fa-cai` | `https://6h2pa-qiaaa-aaaao-qp4fa-cai.icp0.io/` |
| historian | `nnx_historian_staging` | `yo47z-piaaa-aaaac-qg3xa-cai` | n/a |

Codex may upgrade these staging canisters with `dfx` using the `codex-local`
identity, following `docs/staging-deploy.md`.

## Production

Production canisters are explicit placeholders for now:

| Role | Canister ID |
| --- | --- |
| frontend | null placeholder |
| historian | null placeholder |

Rules:

- Do not deploy production without explicit human approval in the current task.
- Do not create production canisters.
- Do not invent production canister IDs.
- Do not store private keys, PEMs, seed phrases, identities, or controller
  secrets in deployment registry files.
