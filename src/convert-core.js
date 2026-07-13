// ===========================================================================
// convert-core.js
//
// Pure, Electron-independent conversion logic extracted from main.js so it can
// be unit-tested in plain Node. This module owns:
//   - format / codec configuration (containers, encoder tables)
//   - encoder resolution (software + hardware)
//   - quality (CRF / bitrate) mapping per encoder family
//   - video filter chain construction
//   - the fluent-ffmpeg command builder
//   - ffmpeg capability parsing
//   - output-path naming + effective-duration + small helpers
//
// main.js requires this module and layers the Electron-specific pieces
// (windows, IPC, dialogs, binary discovery) on top. Nothing here touches
// `electron`, so it loads cleanly in a test runner.
// ===========================================================================

const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');

// ===========================================================================
// Format / codec configuration
// ===========================================================================

// Container definitions: which codecs each container accepts and its defaults.
const CONTAINERS = {
  mp4:  { kind: 'video', fmt: 'mp4',      ext: 'mp4',  video: ['h264', 'h265', 'av1', 'mpeg4'],                    audio: ['aac', 'mp3', 'ac3', 'eac3'],                    dv: 'h264',  da: 'aac',  subs: 'mov_text' },
  mkv:  { kind: 'video', fmt: 'matroska', ext: 'mkv',  video: ['h264', 'h265', 'av1', 'vp9', 'vp8', 'mpeg4', 'mpeg2'], audio: ['aac', 'mp3', 'flac', 'ac3', 'eac3', 'opus', 'vorbis'], dv: 'h264',  da: 'aac',  subs: 'srt' },
  webm: { kind: 'video', fmt: 'webm',     ext: 'webm', video: ['vp9', 'vp8', 'av1'],                              audio: ['opus', 'vorbis'],                               dv: 'vp9',   da: 'opus', subs: 'webvtt' },
  avi:  { kind: 'video', fmt: 'avi',      ext: 'avi',  video: ['mpeg4', 'h264', 'mpeg2'],                         audio: ['mp3', 'ac3', 'aac'],                            dv: 'mpeg4', da: 'mp3',  subs: null },
  mpeg: { kind: 'video', fmt: 'mpeg',     ext: 'mpeg', video: ['mpeg2', 'mpeg4'],                                 audio: ['mp2', 'mp3', 'ac3'],                            dv: 'mpeg2', da: 'mp2',  subs: null },
  // Audio-only containers
  wav:  { kind: 'audio', fmt: 'wav',  ext: 'wav',  audio: ['pcm_s16le', 'pcm_s24le'], da: 'pcm_s16le' },
  mp3:  { kind: 'audio', fmt: 'mp3',  ext: 'mp3',  audio: ['mp3'],                    da: 'mp3' },
  m4a:  { kind: 'audio', fmt: 'ipod', ext: 'm4a',  audio: ['aac', 'alac'],            da: 'aac' },
  flac: { kind: 'audio', fmt: 'flac', ext: 'flac', audio: ['flac'],                   da: 'flac' },
  opus: { kind: 'audio', fmt: 'opus', ext: 'opus', audio: ['opus'],                   da: 'opus' },
  ogg:  { kind: 'audio', fmt: 'ogg',  ext: 'ogg',  audio: ['vorbis', 'opus'],         da: 'vorbis' },
};

// Software encoder names.
const VIDEO_ENC = {
  h264: 'libx264', h265: 'libx265', av1: 'libsvtav1',
  vp9: 'libvpx-vp9', vp8: 'libvpx', mpeg4: 'mpeg4', mpeg2: 'mpeg2video',
};
const AUDIO_ENC = {
  aac: 'aac', 'he-aac': 'libfdk_aac', mp3: 'libmp3lame', mp2: 'mp2',
  flac: 'flac', ac3: 'ac3', eac3: 'eac3', opus: 'libopus', vorbis: 'libvorbis',
  alac: 'alac', pcm_s16le: 'pcm_s16le', pcm_s24le: 'pcm_s24le',
};
// Hardware encoder variants keyed by "<accel>:<codec>".
const HW_ENC = {
  'videotoolbox:h264': 'h264_videotoolbox', 'videotoolbox:h265': 'hevc_videotoolbox',
  'nvenc:h264': 'h264_nvenc', 'nvenc:h265': 'hevc_nvenc', 'nvenc:av1': 'av1_nvenc',
  'qsv:h264': 'h264_qsv', 'qsv:h265': 'hevc_qsv', 'qsv:av1': 'av1_qsv',
  'vaapi:h264': 'h264_vaapi', 'vaapi:h265': 'hevc_vaapi',
};

const LOSSLESS_AUDIO = new Set(['flac', 'alac', 'pcm_s16le', 'pcm_s24le']);

// ===========================================================================
// Capability parsing (pure): given the raw output of `ffmpeg -encoders`,
// derive which codecs / hardware accelerators are usable.
// ===========================================================================

function parseCapabilities(encOut, opts = {}) {
  const {
    platform = process.platform,
    ffmpegSource = 'bundled',
    ffmpegPath = null,
  } = opts;

  const text = encOut || '';
  const has = (name) => new RegExp(`\\b${name.replace(/[-]/g, '\\-')}\\b`).test(text);

  // Available video codecs (software) — verified against the encoder list.
  const videoCodecs = Object.keys(VIDEO_ENC).filter(c => has(VIDEO_ENC[c]));
  const audioCodecs = Object.keys(AUDIO_ENC).filter(c => has(AUDIO_ENC[c]) || AUDIO_ENC[c] === c);

  // Hardware accelerators actually present.
  const accels = [];
  for (const [key, enc] of Object.entries(HW_ENC)) {
    const accel = key.split(':')[0];
    if (has(enc) && !accels.includes(accel)) accels.push(accel);
  }
  // Platform default accel.
  let defaultAccel = 'none';
  if (platform === 'darwin' && accels.includes('videotoolbox')) defaultAccel = 'videotoolbox';
  else if (accels.includes('nvenc')) defaultAccel = 'nvenc';
  else if (accels.includes('qsv')) defaultAccel = 'qsv';

  return {
    ffmpegOk: true, ffmpegSource, ffmpegPath,
    videoCodecs, audioCodecs,
    hwAccels: accels,
    defaultAccel,
    heAac: has('libfdk_aac'),
    hwCodecs: HW_ENC, // renderer uses this to know which codec+accel combos exist
    hwAvailable: Object.fromEntries(Object.entries(HW_ENC).filter(([, e]) => has(e)).map(([k]) => [k, true])),
  };
}

// The capability set returned when no usable ffmpeg is found.
function emptyCapabilities(ffmpegSource = 'missing') {
  return {
    ffmpegOk: false, ffmpegSource, ffmpegPath: null,
    videoCodecs: [], audioCodecs: [], hwAccels: [], defaultAccel: 'none',
    heAac: false, hwCodecs: HW_ENC, hwAvailable: {},
  };
}

// ===========================================================================
// Command builder
// ===========================================================================

function resolveVideoEncoder(codec, accel, caps) {
  if (codec === 'copy') return 'copy';
  if (accel && accel !== 'none') {
    const hw = HW_ENC[`${accel}:${codec}`];
    if (hw && caps.hwAvailable[`${accel}:${codec}`]) return hw;
  }
  return VIDEO_ENC[codec] || codec;
}

function resolveAudioEncoder(codec, caps) {
  if (codec === 'copy') return 'copy';
  if (codec === 'he-aac') return caps.heAac ? 'libfdk_aac' : 'aac';
  return AUDIO_ENC[codec] || codec;
}

// Apply quality settings (CRF or bitrate) appropriate to the encoder family.
function applyVideoQuality(cmd, encoder, s) {
  const crf = clamp(s.crf, 0, 63);
  const speed = s.speed || 'medium';

  const isX = /libx26[45]/.test(encoder);
  const isSvtAv1 = encoder === 'libsvtav1';
  const isVpx = /libvpx/.test(encoder);
  const isMpeg = /mpeg4|mpeg2video/.test(encoder);
  const isVT = /videotoolbox/.test(encoder);
  const isNvenc = /nvenc/.test(encoder);
  const isQsv = /qsv/.test(encoder);
  const isVaapi = /vaapi/.test(encoder);

  if (s.qualityMode === 'bitrate') {
    cmd.videoBitrate(`${s.videoBitrate || 4000}k`);
  } else {
    // Constant-quality path per encoder family.
    if (isX || isSvtAv1) cmd.outputOptions([`-crf`, String(crf)]);
    else if (isVpx) cmd.outputOptions([`-crf`, String(crf), `-b:v`, `0`]);
    else if (isNvenc) cmd.outputOptions([`-rc`, `vbr`, `-cq`, String(crf), `-b:v`, `0`]);
    else if (isQsv) cmd.outputOptions([`-global_quality`, String(crf)]);
    else if (isVaapi) cmd.outputOptions([`-rc_mode`, `CQP`, `-qp`, String(crf)]);
    else if (isVT) cmd.outputOptions([`-q:v`, String(Math.round(((63 - crf) / 63) * 100))]);
    else if (isMpeg) cmd.outputOptions([`-q:v`, String(clamp(Math.round(crf / 6) + 1, 1, 31))]);
    else cmd.outputOptions([`-crf`, String(crf)]);
  }

  // Speed / preset mapping.
  if (isX) {
    cmd.outputOptions([`-preset`, speed]);
  } else if (isSvtAv1) {
    const map = { ultrafast: 12, superfast: 11, veryfast: 10, faster: 9, fast: 8, medium: 6, slow: 4, slower: 3, veryslow: 2 };
    cmd.outputOptions([`-preset`, String(map[speed] ?? 6)]);
  } else if (isVpx) {
    const map = { ultrafast: 8, superfast: 7, veryfast: 6, faster: 5, fast: 4, medium: 3, slow: 2, slower: 1, veryslow: 0 };
    cmd.outputOptions([`-cpu-used`, String(map[speed] ?? 3), `-deadline`, speed === 'ultrafast' ? 'realtime' : 'good', `-row-mt`, `1`]);
  } else if (isNvenc) {
    const map = { ultrafast: 'p1', superfast: 'p2', veryfast: 'p3', faster: 'p3', fast: 'p4', medium: 'p5', slow: 'p6', slower: 'p6', veryslow: 'p7' };
    cmd.outputOptions([`-preset`, map[speed] ?? 'p5']);
  }
}

function applyAudioQuality(cmd, codec, s) {
  if (LOSSLESS_AUDIO.has(codec)) return; // bitrate is meaningless for lossless
  cmd.audioBitrate(`${s.audioBitrate || 192}k`);
  if (codec === 'he-aac') cmd.outputOptions(['-profile:a', 'aac_he_v2']);
}

// Escape a path for use inside the subtitles= filter argument.
function escFilterPath(p) {
  return p.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

function buildVideoFilters(s) {
  const f = [];
  const flt = s.filters || {};

  // De-interlacing family (order first).
  if (flt.detelecine) f.push('fieldmatch', 'yadif=deint=interlaced', 'decimate');
  else if (flt.deinterlace === 'yadif') f.push('yadif');
  else if (flt.deinterlace === 'bwdif') f.push('bwdif'); // "decomb"-style

  // Denoise.
  if (flt.denoise && flt.denoise !== 'off') {
    const lv = { light: 'hqdn3d=2:1:2:3', medium: 'hqdn3d=4:3:6:4.5', strong: 'hqdn3d=8:6:12:9' };
    f.push(lv[flt.denoise] || lv.light);
  }

  // Deblock.
  if (flt.deblock) f.push('deblock');

  // Crop (w:h:x:y).
  if (flt.crop && flt.crop.w && flt.crop.h) {
    const { w, h, x = 0, y = 0 } = flt.crop;
    f.push(`crop=${w}:${h}:${x}:${y}`);
  }

  // Scale — height-driven, width auto (even).
  if (flt.scaleHeight && flt.scaleHeight !== 'source') {
    f.push(`scale=-2:${flt.scaleHeight}`);
  }

  // Grayscale.
  if (flt.grayscale) f.push('hue=s=0');

  // Colourspace → BT.709.
  if (flt.colorspace === 'bt709') f.push('scale=in_color_matrix=auto:out_color_matrix=bt709', 'format=yuv420p');

  return f;
}

function buildCommand(inputPath, outPath, s, caps, effectiveDuration) {
  const container = CONTAINERS[s.container];
  const cmd = ffmpeg(inputPath);

  // Trim (accurate, output-side seeking).
  if (s.trim && s.trim.start > 0) cmd.setStartTime(s.trim.start);
  if (s.trim && s.trim.end > 0 && s.trim.end > (s.trim.start || 0)) {
    cmd.setDuration(s.trim.end - (s.trim.start || 0));
  }

  const videoFilters = buildVideoFilters(s);

  if (container.kind === 'audio') {
    // Audio-only output: drop video, encode/copy audio.
    cmd.noVideo();
    const aenc = resolveAudioEncoder(s.audioCodec === 'copy' ? container.da : s.audioCodec, caps);
    cmd.audioCodec(aenc);
    if (aenc !== 'copy') applyAudioQuality(cmd, s.audioCodec, s);
  } else {
    // ---- Video ----
    if (s.videoCodec === 'none') {
      cmd.noVideo();
    } else {
      const venc = resolveVideoEncoder(s.videoCodec, s.hwAccel, caps);
      cmd.videoCodec(venc);

      // Subtitle burn-in appends to the filter chain (forces re-encode).
      let filters = videoFilters.slice();
      if (s.subtitles && s.subtitles.mode === 'burn' && s.subtitles.file) {
        filters.push(`subtitles='${escFilterPath(s.subtitles.file)}'`);
      }

      if (venc !== 'copy') {
        if (filters.length) cmd.videoFilters(filters);
        applyVideoQuality(cmd, venc, s);

        // Frame-rate handling.
        if (s.fpsMode === 'cfr' && s.fps) cmd.fps(Number(s.fps));
        else if (s.fpsMode === 'vfr') cmd.outputOptions(['-fps_mode', 'vfr']);

        // HDR pass-through (color metadata) — best with H.265/AV1.
        if (s.hdrPassthru) {
          cmd.outputOptions(['-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc']);
          if (venc === 'libx265') {
            cmd.outputOptions(['-x265-params', 'hdr-opt=1:repeat-headers=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc']);
          }
        }
        // Broadly compatible pixel format for 8-bit SDR H.264.
        if (venc === 'libx264' && !s.hdrPassthru) cmd.outputOptions(['-pix_fmt', 'yuv420p']);
      }
    }

    // ---- Audio ----
    if (s.audioCodec === 'none') {
      cmd.noAudio();
    } else {
      const aenc = resolveAudioEncoder(s.audioCodec, caps);
      cmd.audioCodec(aenc);
      if (aenc !== 'copy') applyAudioQuality(cmd, s.audioCodec, s);
    }

    // ---- Subtitles (non-burn) ----
    if (s.subtitles && s.subtitles.mode === 'passthru' && container.subs) {
      cmd.outputOptions(['-c:s', container.subs]);
    } else if (!s.subtitles || s.subtitles.mode === 'none' || s.subtitles.mode === 'burn') {
      cmd.outputOptions(['-sn']);
    }

    // ---- Chapters ----
    cmd.outputOptions(['-map_chapters', s.copyChapters ? '0' : '-1']);
  }

  cmd.format(container.fmt).output(outPath);
  return cmd;
}

// ===========================================================================
// Helpers
// ===========================================================================

function clamp(v, lo, hi) { v = Number(v); return isNaN(v) ? lo : Math.max(lo, Math.min(hi, v)); }

function timemarkToSeconds(tm) {
  const parts = String(tm).split(':');
  if (parts.length !== 3) return 0;
  const [h, m, s] = parts;
  return Number(h) * 3600 + Number(m) * 60 + parseFloat(s);
}

// Determine the effective (post-trim) duration used for progress + estimates.
function effectiveDuration(fullDur, trim) {
  let effDur = fullDur;
  if (trim) {
    const start = trim.start || 0;
    const end = trim.end && trim.end > start ? trim.end : fullDur;
    if (end) effDur = end - start;
  }
  return effDur;
}

// Choose a non-clobbering output path: "<base>.<ext>", then "<base> (1).<ext>",
// etc. An existing file that resolves to the *input* itself is allowed (in-place
// re-encode target), matching main.js behavior.
function nextOutputPath(dir, base, ext, inputPath, existsFn = fs.existsSync) {
  let outPath = path.join(dir, `${base}.${ext}`);
  let n = 1;
  while (existsFn(outPath) && path.resolve(outPath) !== path.resolve(inputPath)) {
    outPath = path.join(dir, `${base} (${n}).${ext}`); n++;
  }
  return outPath;
}

module.exports = {
  CONTAINERS, VIDEO_ENC, AUDIO_ENC, HW_ENC, LOSSLESS_AUDIO,
  parseCapabilities, emptyCapabilities,
  resolveVideoEncoder, resolveAudioEncoder,
  applyVideoQuality, applyAudioQuality,
  escFilterPath, buildVideoFilters, buildCommand,
  clamp, timemarkToSeconds, effectiveDuration, nextOutputPath,
};
