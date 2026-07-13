# Testing

The suite has three layers. Layers 1–2 run anywhere with Node; layer 3 needs a
desktop Electron environment.

| Layer | Tool | What it covers | Command |
|-------|------|----------------|---------|
| Unit | Vitest | Pure conversion logic + renderer helpers + a jsdom UI boot | `npm run test:unit` |
| Integration | Vitest | Real ffmpeg conversions of a synthetic clip | `npm run test:integration` |
| E2E | Playwright | The live Electron app window | `npm run test:e2e` |

```bash
npm test              # unit + integration (Vitest)
npm run test:watch    # Vitest in watch mode
npm run test:coverage # Vitest with V8 coverage (src/ + renderer/util.js)
npm run test:e2e      # Playwright, launches Electron (run on your Mac)
```

## What changed in the app to make it testable

The conversion logic was **extracted, not rewritten** — behavior is unchanged.

- `src/convert-core.js` — new module holding all the Electron-free logic that
  used to live inline in `main.js`: the container/codec tables, encoder
  resolution (software + hardware), CRF/bitrate quality mapping, the video
  filter chain, the fluent-ffmpeg command builder, ffmpeg capability parsing,
  output-path naming, and the small helpers. `main.js` now `require`s it and
  keeps only the Electron pieces (windows, IPC, dialogs, binary discovery).
- `renderer/util.js` — new dual-mode module (browser global `MC` + CommonJS
  export) holding the renderer's pure helpers and constants (`fmtSize`,
  `fmtTime`, `escapeHtml`, `truncate`, device presets, supported inputs, plus
  the extracted `estimateSize` / `effectiveTrimDuration` used by the size
  estimate). Loaded before `renderer.js` in `index.html`.

## Test layout

```
tests/
  helpers.js                     shared fixtures (fake command, caps, settings)
  unit/
    helpers.test.js              clamp, timemark, trim duration, output naming, path escaping
    capabilities.test.js         ffmpeg -encoders parsing -> codec/hwaccel detection
    encoders.test.js             software + hardware encoder resolution & fallback
    filters.test.js              video filter chain construction & ordering
    quality.test.js              CRF/bitrate mapping per encoder family; audio bitrate
    build-command.test.js        full ffmpeg argv across the format/feature matrix
    containers.test.js           container config invariants
    renderer-util.test.js        renderer formatters, estimate math, presets
    renderer-dom.test.js         boots the real renderer in jsdom w/ mocked api
  integration/
    convert.test.js              real ffmpeg: mp4->mkv/avi, mp3/wav extract, trim, scale, grayscale, drop-audio
  e2e/
    app.spec.js                  Playwright: launches Electron, checks the UI shell
    README.md                    how to run the E2E layer
```

The integration layer resolves ffmpeg like the app does (bundled → ffmpeg-static
→ system PATH) and **skips itself** cleanly if no runnable binary is available.

## Notes / behaviours pinned by tests (pre-existing, worth knowing)

1. **Self-named audio codecs always report as available.** `parseCapabilities`
   treats a codec as present when its encoder name equals the codec name, so
   `aac, mp2, flac, ac3, eac3, alac, pcm_s16le, pcm_s24le` are reported even if
   ffmpeg lists nothing. Codecs behind a distinct library (`mp3→libmp3lame`,
   `opus→libopus`, `vorbis→libvorbis`) are detected correctly. Pinned in
   `capabilities.test.js`.
2. **WAV/`copy` writes a redundant `-b:a`.** For an audio container with
   `audioCodec: 'copy'`, the builder encodes to the container default (PCM) but
   still passes `-b:a 192k`; ffmpeg ignores it for PCM. Pinned in
   `build-command.test.js`. Harmless, but a candidate cleanup.

Neither is a regression from the refactor — both reflect the original `main.js`.
