<div align="center">

# ❄️ Polar Media Converter

**A sleek, modern desktop app for converting media between MP4, MKV, WebM, AVI, MPEG and popular audio formats.**

FFmpeg is bundled — end users install nothing.

</div>

---

## Highlights

- **Drag & drop or browse** — queue up many files and convert them in a batch.
- **Wide format support** — MP4, MKV, WebM, AVI, MPEG plus audio (WAV, MP3, M4A, FLAC, Opus, OGG).
- **Modern codecs** — H.264, H.265 (HEVC), AV1, VP9/VP8, MPEG-4/2 for video; AAC, HE-AAC, MP3, FLAC, AC-3, Opus, Vorbis, ALAC, PCM for audio.
- **Hardware acceleration** — VideoToolbox / NVENC / Quick Sync / VAAPI, auto-detected. Codec lists are filtered live to what the bundled FFmpeg actually supports.
- **Quality controls** — Constant Quality (CRF) or Average Bitrate, per-encoder speed presets, resolution scaling, and VFR/CFR.
- **Editing** — trim by start/end, chapter pass-through, subtitle pass-through or burn-in, and HDR (BT.2020/PQ) pass-through.
- **Video filters** — deinterlace, decomb, detelecine, denoise, deblock, grayscale, BT.709, crop & scale.
- **Visibility** — live preview thumbnail, estimated output size + ETA, and an **engine log drawer** streaming the exact FFmpeg command and output.
- **Presets & themes** — built-in device presets, saveable custom presets, and light / dark / follow-system themes.

## Getting started

```bash
npm install            # installs Electron + dev tools
npm run fetch-ffmpeg   # places ffmpeg + ffprobe in resources/bin
npm start              # launch the app
```

If `npm run fetch-ffmpeg` can't download automatically (offline / corporate
proxy), it prints exactly where to drop a static `ffmpeg`/`ffprobe` binary — see
`resources/bin/README.md`.

## Building a standalone installer

```bash
npm run dist           # runs fetch-ffmpeg, then builds dmg / nsis / AppImage
```

FFmpeg and ffprobe are bundled **inside** the app (`build.extraResources` →
`resources/bin`). The shipped app is fully self-contained: end users install
nothing — no FFmpeg, no runtime, no dependencies. At startup the app resolves
the binary from inside its own bundle; a system FFmpeg is only ever used as a
last-resort fallback during development.

## Testing

The suite has three layers — see [`TESTING.md`](./TESTING.md) for the full breakdown.

```bash
npm test               # unit + integration (Vitest)
npm run test:coverage  # with coverage
npm run test:e2e       # end-to-end Electron tests (Playwright, run on a desktop OS)
```

## How it works

Polar Media Converter is a small Electron app. The conversion logic is kept in a
plain, Electron-free module so it can be tested without launching the app.

```
main.js                  Electron main process — windows, IPC, dialogs, FFmpeg discovery
preload.js               Secure contextBridge API exposed to the UI
src/
  convert-core.js        Pure logic: containers, encoders, command builder, capabilities
renderer/
  index.html             The interface
  styles.css             Styling
  renderer.js            UI behavior
  util.js                Shared, DOM-free helpers + constants
tests/
  unit/                  Fast, isolated tests (core logic + renderer helpers + jsdom boot)
  integration/           Real FFmpeg conversions of a synthetic clip
  e2e/                   Playwright tests driving the live Electron window
scripts/
  fetch-ffmpeg.js        Downloads / copies the bundled FFmpeg binaries
```

## Troubleshooting a failed conversion

Click **Engine log** in the top bar. It streams the exact FFmpeg command and its
output for every job. On failure, the log (and the file row's error text) shows
the specific FFmpeg error — usually a codec/container mismatch or an unsupported
option. Available codecs are filtered to what the bundled FFmpeg supports, so
options that would fail are hidden automatically.

## License

MIT © Moyar
