# Pollyweb Docs Site

## Test error UI states

Use these URL queries to force each error path and validate the UI:

- `?test=force-page-error`: forces a docs page fetch error and shows the page-level error card.
- `?test=force-source-error`: forces a source/bootstrap error and shows the top-level load error card.
- `?test=load-failure`: forces a missing file flow.

How to run it:

1. Open the site locally.
2. Add one of the `?test=` values above to the URL, or use the test links shown in the viewer placeholder.
3. Verify the expected error state renders for that mode.
