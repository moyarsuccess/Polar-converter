// @vitest-environment jsdom
//
// Boots the real renderer (util.js + renderer.js) inside jsdom against the real
// index.html, with the Electron `window.api` bridge mocked. This exercises the
// UI wiring end-to-end without launching Electron: capability-driven codec
// lists, format pills, preset menu, and the ffmpeg-missing state.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const rendDir = path.resolve(__dirname, '../../renderer');
const utilSrc = fs.readFileSync(path.join(rendDir, 'util.js'), 'utf8');
const rendSrc = fs.readFileSync(path.join(rendDir, 'renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(rendDir, 'index.html'), 'utf8');
const bodyInner = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)[1]
  // strip the <script> tags — we evaluate the JS ourselves
  .replace(/<script[\s\S]*?<\/script>/gi, '');

const { CONTAINERS } = require('../../src/convert-core');

function fullCaps(overrides = {}) {
  return {
    ffmpegOk: true, ffmpegSource: 'bundled', ffmpegPath: '/x/ffmpeg',
    videoCodecs: ['h264', 'h265', 'av1', 'vp9', 'vp8', 'mpeg4', 'mpeg2'],
    audioCodecs: ['aac', 'mp3', 'flac', 'ac3', 'opus', 'vorbis', 'pcm_s16le'],
    hwAccels: ['videotoolbox'], defaultAccel: 'videotoolbox', heAac: false,
    hwCodecs: {}, hwAvailable: { 'videotoolbox:h264': true, 'videotoolbox:h265': true },
    ...overrides,
  };
}

function mockApi(caps) {
  const noop = () => () => {};
  return {
    getCapabilities: vi.fn().mockResolvedValue(caps),
    getContainers: vi.fn().mockResolvedValue(CONTAINERS),
    getTheme: vi.fn().mockResolvedValue('dark'),
    setTheme: vi.fn().mockResolvedValue('dark'),
    onProgress: vi.fn(noop), onLog: vi.fn(noop),
    pickFiles: vi.fn(), resolvePaths: vi.fn(), pickSubtitle: vi.fn(),
    pickOutputDir: vi.fn(), openPath: vi.fn(), probe: vi.fn(),
    thumbnail: vi.fn(), getPathForFile: vi.fn(), convert: vi.fn(), cancelJob: vi.fn(),
  };
}

async function bootRenderer(caps) {
  document.body.innerHTML = bodyInner;
  // jsdom lacks matchMedia; provide a minimal stub.
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  window.api = mockApi(caps);
  // No saved custom presets for a clean boot. `localStorage.clear` isn't
  // implemented by every jsdom version, so guard it.
  try { if (typeof localStorage !== 'undefined' && localStorage.clear) localStorage.clear(); } catch (_) {}
  // Load util.js (defines global MC), then renderer.js (calls boot()).
  // eslint-disable-next-line no-eval
  (0, eval)(utilSrc);
  (0, eval)(rendSrc);
  // Let boot()'s awaited IPC promises resolve.
  await Promise.resolve();
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
}

describe('renderer boot (jsdom)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('renders a format pill per available container with MP4 active by default', async () => {
    await bootRenderer(fullCaps());
    const pills = [...document.querySelectorAll('#formatPills .pill')];
    expect(pills.length).toBeGreaterThanOrEqual(11);
    const active = document.querySelector('#formatPills .pill.active');
    expect(active).not.toBeNull();
    expect(active.dataset.format).toBe('mp4');
  });

  it('populates the video + audio codec dropdowns for the MP4 container', async () => {
    await bootRenderer(fullCaps());
    const vcodec = [...document.querySelectorAll('#videoCodec option')].map(o => o.value);
    const acodec = [...document.querySelectorAll('#audioCodec option')].map(o => o.value);
    // MP4 accepts h264/h265/av1/mpeg4 among the codecs the engine supports.
    expect(vcodec).toEqual(expect.arrayContaining(['h264', 'h265']));
    expect(acodec).toEqual(expect.arrayContaining(['aac']));
    // copy/none are always offered for video.
    expect(vcodec).toEqual(expect.arrayContaining(['copy', 'none']));
  });

  it('lists device presets in the preset menu', async () => {
    await bootRenderer(fullCaps());
    const labels = [...document.querySelectorAll('#presetSelect option')].map(o => o.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Fast 1080p (H.264)', 'Extract MP3']));
  });

  it('switching the format pill to WAV hides the video-only controls', async () => {
    await bootRenderer(fullCaps());
    const wav = [...document.querySelectorAll('#formatPills .pill')].find(p => p.dataset.format === 'wav');
    expect(wav).toBeTruthy();
    wav.click();
    expect(document.getElementById('videoCodecField').classList.contains('hidden')).toBe(true);
  });

  it('shows the normal Convert label when ffmpeg is available (disabled only for empty queue)', async () => {
    await bootRenderer(fullCaps());
    const btn = document.getElementById('convertBtn');
    // Nothing queued yet, so it is disabled — but NOT in the ffmpeg-missing state.
    expect(btn.textContent).toBe('Convert');
    expect(btn.textContent).not.toMatch(/FFmpeg missing/i);
  });

  it('shows an ffmpeg-missing state when the engine is unavailable', async () => {
    await bootRenderer(fullCaps({ ffmpegOk: false, ffmpegPath: null, videoCodecs: [], audioCodecs: [], hwAccels: [] }));
    const btn = document.getElementById('convertBtn');
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toMatch(/FFmpeg missing/i);
  });
});
