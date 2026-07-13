import { defineConfig } from 'vitest/config';

// Unit + integration tests run under Vitest. The default environment is Node
// (for the Electron-free core module and the ffmpeg integration tests). UI
// tests opt into jsdom per-file with a `// @vitest-environment jsdom` docblock.
//
// Playwright E2E tests live in tests/e2e and are run by Playwright, not Vitest,
// so they are excluded here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    testTimeout: 60000,       // integration conversions can take a few seconds
    hookTimeout: 60000,
    reporters: 'default',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js', 'renderer/util.js'],
      reporter: ['text', 'html'],
    },
  },
});
