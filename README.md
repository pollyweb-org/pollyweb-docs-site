# Pollyweb Docs Site

## Automated tests

This project uses `vitest` for unit tests.

- Install dependencies: `npm install`
- Run tests once: `npm test`
- Run tests in watch mode: `npm run test:watch`

## Caching and `api.pollyweb.org` dependency

This app uses `window.PortalCache` (`js/core/cache.js`) for all HTTP reads. Cache entries are kept:

- In memory (`Map`) for the active tab/session.
- In `localStorage` (when `persistent: true`) so data survives reloads.

Key behavior:

- Cache keys are request-specific (for example `docs-page:owner/repo@branch:root:path`).
- Fresh hits return immediately.
- Stale hits can still be returned (`staleWhileRevalidate: true`) while a background refresh runs.
- `ETag` values are reused with `If-None-Match`; `304` responses extend TTL without re-downloading payloads.
- Failed responses are also cached for a short time (`negativeTtlMs`) to avoid rapid retry loops.
- Duplicate in-flight requests share one network call.
- If refresh fails and stale data exists, stale content can still be served (`allowStaleOnError: true`).

Current dependency on `api.pollyweb.org`:

- Page content fetches are routed through `https://api.pollyweb.org/docs/page` (`fetchRawFile` -> `fetchPageViaPollywebApi` in `js/core/api.js`).
- If `api.pollyweb.org` is unavailable (or returns errors), new page loads fail once no usable cached page exists.
- Existing cached pages may still render temporarily (stale fallback), but the site cannot reliably serve uncached/new docs without this API.

What is *not* dependent on `api.pollyweb.org`:

- Source resolution (`/repos/:owner/:repo`) and tree listing (`/git/trees/...`) are read from `api.github.com` and cached separately.

## Test error UI states

Use these URL queries to force each error path and validate the UI:

- `?test=force-page-error`: forces a docs page fetch error and shows the page-level error card.
- `?test=force-source-error`: forces a source/bootstrap error and shows the top-level load error card.
- `?test=load-failure`: forces a missing file flow.

How to run it:

1. Open the site locally.
2. Add one of the `?test=` values above to the URL, or use the test links shown in the viewer placeholder.
3. Verify the expected error state renders for that mode.
