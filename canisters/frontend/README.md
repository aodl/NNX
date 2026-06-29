# NNX Frontend Canister

This canister serves the Network Nexus browser app as certified static assets from Rust.

## Serving Model

Assets under `canisters/frontend/public` are embedded with `include_dir` and certified on `init` and `post_upgrade`. The private build manifest `generated/frontend-bundle.json` is embedded but excluded from public certified routes.

No custom JSON dashboard endpoints are exposed. Browser data reads go directly to NNS Governance through the query facade.

## Routes

```text
GET  /                       -> index.html, 200
HEAD /                       -> index metadata, 200
GET  /neuron/{decimal_nat64}  -> index.html, 200
HEAD /neuron/{decimal_nat64}  -> index metadata, 200
GET  /neuron/not-a-number    -> 404.html, 404
GET  /neuron/123/extra       -> 404.html, 404
GET  /proposal/{decimal_nat64}  -> index.html, 200
HEAD /proposal/{decimal_nat64}  -> index metadata, 200
GET  /proposal/not-a-number     -> 404.html, 404
GET  /proposal/123/extra        -> 404.html, 404
GET  /subnet/{principal}        -> index.html, 200
HEAD /subnet/{principal}        -> index metadata, 200
GET  /subnet/not-a-principal    -> 404.html, 404
GET  /subnet/{principal}/extra  -> 404.html, 404
GET  /map/ne_110m_land.geojson  -> Natural Earth 110m land GeoJSON, 200
HEAD /map/ne_110m_land.geojson  -> GeoJSON metadata, 200
GET  /missing                -> 404.html, 404
GET  /generated/app.<hash>.js -> JavaScript asset, 200
GET  /generated/frontend-bundle.json -> 404
```

## Cache Policy

`index.html`, `404.html`, `/.well-known/ic-domains`, `base.css`, and `map/ne_110m_land.geojson` use no-cache headers.

Content-hashed generated bundles use immutable cache headers.

## Map Asset Attribution

`public/map/ne_110m_land.geojson` is derived from Natural Earth 110m land data. Natural Earth vector map data is public domain; see https://www.naturalearthdata.com/about/terms-of-use/.

## Build Output

The frontend build writes:

```text
canisters/frontend/public/generated/app.<12-char-sha256>.js
canisters/frontend/public/generated/frontend-bundle.json
```

The build stamps `index.html` with the current bundle path.

## Declarations

NNS Governance declarations are checked in under:

```text
canisters/frontend/web/declarations/nns_governance/
```

The declaration is browser-compatible and scoped to the current `list_neurons`, `list_known_neurons`, `list_node_providers`, `list_proposals`, and `get_proposal_info` query use.
