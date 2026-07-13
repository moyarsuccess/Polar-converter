const { defineConfig } = require('@playwright/test');

// End-to-end tests drive the real Electron app. They require a desktop
// environment with the platform's Electron binary (i.e. run them on your Mac,
// not in a headless CI container without a display). See tests/e2e/README.md.
module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,     // a single Electron instance at a time
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
