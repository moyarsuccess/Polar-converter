# Media Converter

A stylish, modern Electron desktop app for converting media between **MP4, MPEG, WAV, MKV, and AVI**. FFmpeg is bundled — no separate install required.

## Run it

```bash
npm install         # installs Electron; auto-copies ffmpeg if it downloaded
npm run fetch-ffmpeg   # ensures ffmpeg + ffprobe are in resources/bin
npm start
```

## Build a standalone installer

```bash
npm run dist        # runs fetch-ffmpeg, then builds dmg / nsis / AppImage
```

FFmpeg and ffprobe are bundled **inside** the app (`build.extraResources` →
`resources/bin`). The shipped app is fully self-contained: **end users install
nothing** — no FFmpeg, no runtime, no dependencies. At startup the app resolves
the binary from inside its own bundle; a system FFmpeg is only ever used as a
last-resort fallback during development.

If `npm run fetch-ffmpeg` can't download automatically (offline / corporate
proxy), it prints exactly where to drop a static `ffmpeg`/`ffprobe` binary
(e.g. from evermeet.cx on macOS). See `resources/bin/README.md`.

## Features

- Drag & drop or browse; convert many files at once
- Containers: MP4, MKV, WebM, AVI, MPEG + audio (WAV, MP3, M4A, FLAC, Opus, OGG)
- Codecs: H.264/H.265/AV1/VP9/VP8/MPEG-4/MPEG-2 video; AAC/MP3/FLAC/AC-3/Opus/… audio
- Hardware acceleration (VideoToolbox / NVENC / Quick Sync) auto-detected
- Quality controls: CRF or bitrate, speed presets, resolution scaling, VFR/CFR
- Device presets + saveable custom presets
- Trim, chapters, subtitle pass-through/burn-in, HDR pass-thru
- Video filters: deinterlace, decomb, denoise, deblock, grayscale, crop/scale
- Live preview, estimated size + ETA
- **Engine log** drawer with live FFmpeg output for full visibility
- Light / Dark / Follow-system themes with a gradient accent
- Output to the source folder or a folder you choose

## Troubleshooting a failed conversion

Click **Engine log** in the top bar. It streams the exact FFmpeg command and its
output for every job. On failure the log (and the file row's error text) shows the
specific FFmpeg error — usually a codec/container mismatch or an unsupported option.
Available codecs are filtered to what the bundled FFmpeg supports, so options that
would fail are hidden automatically.

## How it works

- `main.js` — Electron main process; runs FFmpeg (`fluent-ffmpeg` + `ffmpeg-static`) and handles file dialogs, progress, and theming over IPC.
- `preload.js` — secure `contextBridge` API exposed to the UI.
- `renderer/` — the interface (`index.html`, `styles.css`, `renderer.js`).

See `ROADMAP.md` for the planned phase-2 (HandBrake-inspired) features.
