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
helpers, Principal internals, management-canister callers, or historian Candid
clients directly.

Narrowly allowed boundary zones:

- `canisters/frontend/web/src/data/query/`
- `canisters/frontend/web/src/data/topology/`
- generated declaration modules
- historian client boundary modules
- focused tests and fixtures

Raw Registry reads stay inside topology/query modules. The raw Registry client
decodes normal `get_value` records and preserves returned Registry versions for
multi-record consistency warnings. Chunked `largeValueChunkKeys` responses are
not reconstructed yet; they surface as `REGISTRY_LARGE_VALUE_UNSUPPORTED` and
downstream analysis treats affected data as partial/manual-review input instead
of crashing.

Run:

```sh
node tools/scripts/check-boundaries.mjs
```
