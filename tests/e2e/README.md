# End-to-end (E2E) tests

These tests launch the **real Electron app** with Playwright and interact with
the live window. Unlike the unit and integration tests, they need a desktop
environment (a display and the platform's Electron binary), so they are **not**
run by `npm test`.

## Run them

```bash
# one-time: install Playwright's browser deps (no-op for Electron but harmless)
npx playwright install

# make sure ffmpeg is present so the app boots into the "ready" state
npm run fetch-ffmpeg

# run the E2E suite (launches Electron)
npm run test:e2e
```

## Notes

- On headless Linux CI you must wrap the command in a virtual display, e.g.
  `xvfb-run -a npm run test:e2e`.
- The app still launches without ffmpeg, but shows the "FFmpeg missing" state;
  most E2E assertions here only depend on the UI shell, so they pass either way.
- Config lives in `../../playwright.config.js` (single worker, no parallelism —
  one Electron instance at a time).
