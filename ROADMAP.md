# Media Converter — Roadmap

## Phase 1 — Done ✅
Sleek Electron app converting between MP4, MPEG, WAV, MKV, AVI.
Drag-and-drop queue, per-file progress, bundled ffmpeg, light/dark/system themes.

## Phase 2 — Done ✅ (HandBrake-inspired)

### Output & codecs
- Containers: MP4, MKV, **WebM**, AVI, MPEG + audio (WAV, MP3, M4A, FLAC, Opus, OGG)
- Video encoders: H.264, **H.265 (HEVC)**, **AV1**, **VP9/VP8**, MPEG-4, MPEG-2 (+ copy)
- Audio encoders: AAC, HE-AAC, MP3, MP2, FLAC, AC-3, E-AC-3, Opus, Vorbis, ALAC, PCM (+ copy pass-thru)
- **Hardware acceleration** auto-detected: VideoToolbox / NVENC / Quick Sync / VAAPI
- Codec lists are filtered live to what the bundled FFmpeg actually supports

### Quality controls
- **Constant Quality (CRF)** and **Average Bitrate** modes
- Encode **speed presets** (ultrafast → very slow), mapped per encoder family
- **Device presets** (Fast 1080p, HQ 1080p, Phone/Tablet, 4K HEVC, Web VP9, AV1, audio extraction)
- **Saveable custom presets**
- **VFR / CFR** frame-rate control + resolution scaling presets

### Editing / selection
- **Trim** by start/end time
- **Chapter marker** pass-through toggle
- Batch queue with progress, **ETA**, cancel, reveal-in-folder

### Video filters
- Deinterlace (yadif) / Decomb (bwdif) / Detelecine
- Denoise (light/medium/strong), Deblock
- Grayscale, BT.709 colourspace, **crop & scale**

### Subtitles & HDR
- Subtitle pass-through or **burn-in from file**
- **HDR pass-thru** (BT.2020 / PQ; best with H.265/AV1)

### UX & visibility
- **Live preview** thumbnail per file
- **Estimated output size** (bitrate mode) + ETA
- **Engine log drawer** streaming live FFmpeg command + output for full transparency

## Later ideas
- Live video (scrubbing) preview, hardware-decode pipeline, DVD/BluRay input (out of current scope), per-file individual settings.
