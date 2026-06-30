# Dependency Scanning

NNX uses lockfile, Rust, npm, and OSV checks to keep dependency drift visible.

Run locally:

```sh
npm ci --no-fund --no-audit
node tools/scripts/check-npm-lock-hermetic.mjs
tools/scripts/security-scan
```

`tools/scripts/security-scan` runs `npm audit --audit-level=high`, `cargo audit`,
`cargo deny check`, and `osv-scanner` when installed. CI must fail if these tools
are unavailable. Local runs may explicitly skip missing optional tools with
`NNX_SKIP_SECURITY_TOOLS=1`; the script prints the skipped tools.

The lockfile check rejects non-registry resolved npm URLs and missing integrity
fields. Generated frontend bundles are checked separately because they must not
be committed or staged.
