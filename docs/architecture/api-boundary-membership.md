# API Boundary Membership Source

NNX reads current API boundary node membership through the IC certified state
paths documented by the interface specification:

- `/api_boundary_nodes/<node_id>/domain`
- `/api_boundary_nodes/<node_id>/ipv4_address`
- `/api_boundary_nodes/<node_id>/ipv6_address`

The reader is intentionally targeted. It checks only node IDs already referenced
by a proposal; it does not enumerate all API boundary nodes and does not maintain
a dashboard-side inventory. For each referenced node, NNX requests these certified
paths through `HttpAgent.readSubnetState` against the NNS subnet and verifies the
returned certificate with `Certificate.create`.

Membership semantics:

- any `domain`, `ipv4_address`, or `ipv6_address` path `Found` means the
  referenced node is currently known as an API boundary node
- all requested paths `Absent` means membership was checked and the node is not
  currently known as an API boundary node
- read/certificate failure means membership is unavailable and proposal analysis
  falls back to manual-review behavior
- unsupported lookup states are unavailable, not known non-membership

The query facade exposes this as `queryFacade.getApiBoundaryNodeIds({ nodeIds })`
with:

```js
{
  available: boolean,
  nodeIds: string[],
  apiBoundaryNodeIds: string[], // compatibility alias
  errors: [],
  warnings: []
}
```

`available` is separate from `apiBoundaryNodeIds.length` because a certified
empty result is meaningful.

Forbidden workarounds remain forbidden: dashboard APIs, `ic-api.internetcomputer.org`,
CSV inventories, scraping, IP geolocation APIs, and Globalping-derived validation
state.

UI and proposal-analysis modules receive only normalized node IDs and node
metadata through `queryFacade.getApiBoundaryNodeIds()` and
`queryFacade.getIcTopology()`.
