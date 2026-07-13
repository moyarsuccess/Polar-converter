# resources/bin

The `ffmpeg` and `ffprobe` executables placed here are bundled **inside** the
packaged app by electron-builder (`build.extraResources`). Once they're here, the
shipped app (`.app` / `.exe` / `.AppImage`) is fully self-contained — the end user
does **not** need FFmpeg or anything else installed.

## How they get here

- `npm install` runs a `postinstall` hook that copies them automatically **if**
  `ffmpeg-static` managed to download during install.
- Otherwise run once: `npm run fetch-ffmpeg`
- If your network blocks the automatic download, drop the binaries here manually
  (see the instructions that `npm run fetch-ffmpeg` prints). Name them exactly
  `ffmpeg` / `ffprobe` (or `ffmpeg.exe` / `ffprobe.exe` on Windows).

## Note on cross-platform builds

These binaries are platform-specific. Place the binaries for whichever OS you are
building for. To build installers for multiple platforms, fetch the matching
binaries on each platform (or into per-platform subfolders) before `npm run dist`.
