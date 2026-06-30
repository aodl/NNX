# Browser Smoke Harness

NNX browser smoke tests live in `tests/e2e/` and run with Playwright:

```sh
npm run test:e2e
npm run smoke:browser:local
```

The harness builds the static frontend, serves `canisters/frontend/public`, and
stamps the generated bundle path into `index.html` in the same shape expected
from the certified asset canister.

Playwright injects `window.__NNX_TEST_QUERY_FACADE__` before application
bootstrap. This is a test-only normalized query facade so browser tests can run
without mainnet, a local replica, private credentials, dashboard APIs, or
offchain inventories.

Production pages do not define `window.__NNX_TEST_QUERY_FACADE__`; they create
the normal IC query backend and consume data through `queryFacade`. The hook does
not expose secrets, does not bypass safe URL rendering or DOM text insertion, and
must not be used as a production data source.

Minimal containers may not include Chromium system libraries. In a browser-ready
environment, install them with:

```sh
npx playwright install --with-deps chromium
```
