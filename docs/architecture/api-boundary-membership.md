# API Boundary Membership Source

NNX checked the onchain/system-source options for current API boundary node
membership. The IC interface specification documents certified state paths under
`/api_boundary_nodes/<node_id>/domain` and `/api_boundary_nodes/<node_id>/ipv4_address`,
with the NNS Registry canister as the source of truth for those records.

Current implementation decision: keep `API_BOUNDARY_MEMBERSHIP_UNAVAILABLE`.
The app has an isolated raw Registry `get_value` reader, but it does not yet have
a reliable onchain way to enumerate API boundary node Registry keys or read the
certified state tree paths through the normalized query facade. NNX therefore
does not replace the conservative manual-review behavior in this tranche.

Forbidden workarounds remain forbidden: dashboard APIs, `ic-api.internetcomputer.org`,
CSV inventories, scraping, IP geolocation APIs, and Globalping-derived validation
state.

Future implementation should add one of these boundary-layer sources:

- a certified-state reader that normalizes `/api_boundary_nodes` records; or
- an isolated Registry reader if the Registry exposes a stable key/list for API
  boundary membership.

UI and proposal-analysis modules must receive only normalized node IDs and node
metadata through `queryFacade.getApiBoundaryNodeIds()` or `queryFacade.getIcTopology()`.
