# NNS Topic Generation

`tools/scripts/generate-nns-topics.mjs` generates
`canisters/frontend/web/src/data/topics.generated.js`.

Fallback order:

1. Fetch upstream `governance.proto`.
2. If fetch fails, use `tools/cache/governance.proto` when present.
3. Use the embedded emergency fallback only when
   `NNX_ALLOW_EMBEDDED_TOPIC_FALLBACK=1` is set.

Without upstream access or a committed cache, the build fails with an actionable
error. Generated topic metadata must not cause generated frontend bundles to be
tracked or staged.
