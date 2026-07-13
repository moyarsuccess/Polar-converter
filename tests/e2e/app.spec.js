// End-to-end tests driving the real Electron app via Playwright.
//
// These launch the actual application (main.js + renderer) and interact with
// the live window. Run them on a desktop OS with the platform's Electron
// binary present:  npm run test:e2e
//
// They are intentionally NOT part of `npm test` (Vitest), because they need a
// display/Electron and are slower. See tests/e2e/README.md.
const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '../..');

let app, page;

test.beforeAll(async () => {
  app = await electron.launch({ args: [APP_ROOT] });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  // Wait for boot() to have populated the format pills.
  await page.waitForSelector('#formatPills .pill', { timeout: 15000 });
});

test.afterAll(async () => {
  if (app) await app.close();
});

test('launches a single window titled "Media Converter"', async () => {
  expect(await page.title()).toBe('Media Converter');
  expect(app.windows().length).toBe(1);
});

test('renders the drag-and-drop zone and browse button', async () => {
  await expect(page.locator('#dropzone')).toBeVisible();
  await expect(page.locator('#browseBtn')).toBeVisible();
});

test('renders a format pill per container with MP4 active by default', async () => {
  const pills = page.locator('#formatPills .pill');
  expect(await pills.count()).toBeGreaterThanOrEqual(11);
  await expect(page.locator('#formatPills .pill.active')).toHaveAttribute('data-format', 'mp4');
});

test('populates the video and audio codec dropdowns for MP4', async () => {
  expect(await page.locator('#videoCodec option').count()).toBeGreaterThan(0);
  expect(await page.locator('#audioCodec option').count()).toBeGreaterThan(0);
});

test('selecting an audio container (WAV) hides the video-only controls', async () => {
  await page.locator('#formatPills .pill[data-format="wav"]').click();
  await expect(page.locator('#videoCodecField')).toBeHidden();
  // switch back to mp4 for a clean state
  await page.locator('#formatPills .pill[data-format="mp4"]').click();
  await expect(page.locator('#videoCodecField')).toBeVisible();
});

test('applying a device preset updates the container and codec', async () => {
  await page.locator('#presetSelect').selectOption('device:Web (WebM VP9)');
  await expect(page.locator('#formatPills .pill.active')).toHaveAttribute('data-format', 'webm');
});

test('the engine log drawer opens from the top bar', async () => {
  await page.locator('#logToggle').click();
  await expect(page.locator('#logDock')).not.toHaveClass(/collapsed/);
});

test('the Convert button is disabled with an empty queue', async () => {
  await expect(page.locator('#convertBtn')).toBeDisabled();
});
