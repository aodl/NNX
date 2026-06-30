# Query Boundaries

Allowed dependency direction:

```text
UI/components/routes
  -> services/facades
  -> query facade
  -> canister/system boundary modules
```

UI and domain modules consume normalized objects. They must not import actors,
agents, generated Candid declarations, raw Registry key modules, protobuf decode
helpers, Principal internals, management-canister callers, or proxy Candid
clients directly.

Narrowly allowed boundary zones:

- `canisters/frontend/web/src/data/query/`
- `canisters/frontend/web/src/data/topology/`
- generated declaration modules
- node metrics proxy client boundary modules
- focused tests and fixtures

Run:

```sh
node tools/scripts/check-boundaries.mjs
```
