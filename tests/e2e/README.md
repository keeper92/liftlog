# E2E Tests

This suite covers the offline-safe workout finish flow.

## Prerequisites

- Install Playwright test runner:
  - `npm install -D @playwright/test`
- Install browser binaries:
  - `npx playwright install chromium`

## Run

- `npm run test:e2e`
- `npm run test:e2e:headed`

## Notes

- Tests default to `http://127.0.0.1:3000`.
- Override base URL with `PLAYWRIGHT_BASE_URL`.
- Set `PLAYWRIGHT_SKIP_WEBSERVER=1` to use an already-running app server.
- For deterministic auth in CI/local, set `E2E_EMAIL` and `E2E_PASSWORD`. If unset, tests fall back to the `Try Demo` login path.
