# Governance Proto Cache

`governance.proto` is a pinned cache of the NNS Governance protobuf file from:

https://raw.githubusercontent.com/dfinity/ic/master/rs/nns/governance/proto/ic_nns_governance/pb/v1/governance.proto

The frontend topic generator fetches that upstream file by default. If the fetch
fails, it reads this cache so `npm run build:frontend` remains reproducible in a
fresh or offline environment.

Refresh this cache when NNS topic definitions change upstream or before a release
that intentionally adopts new NNS topic metadata:

```bash
node tools/scripts/update-governance-proto-cache.mjs
npm run test:frontend-unit
npm run build:frontend
```

The refresh script normalizes line endings and rewrites the file deterministically.

The embedded topic fallback in `generate-nns-topics.mjs` is emergency-only. It is
not updated from upstream automatically, so it must only be used by explicitly
setting `NNX_ALLOW_EMBEDDED_TOPIC_FALLBACK=1` when both upstream fetch and the
committed cache are unavailable.
