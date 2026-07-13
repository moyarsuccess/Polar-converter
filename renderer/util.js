// ===========================================================================
// renderer/util.js
//
// Pure, DOM-free helpers and constants shared by the renderer. Extracted from
// renderer.js so they can be unit-tested in Node (jsdom not even required).
//
// Dual-mode module:
//   - In the browser it is loaded via <script> BEFORE renderer.js and attaches
//     everything to the global `MC` namespace.
//   - In tests it is `require()`d and returns the same object via module.exports.
// ===========================================================================

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MC = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Input extensions the app accepts (drag-drop + file picker filter).
  const SUPPORTED_IN = ['mp4', 'mpeg', 'mpg', 'wav', 'mkv', 'avi', 'mov', 'm4a', 'flac', 'webm', 'aac', 'ogg', 'opus', 'mp3', 'ts', 'm2ts', 'wmv', 'flv'];

  // Human labels for codecs.
  const CODEC_LABELS = {
    copy: 'Copy (no re-encode)', h264: 'H.264 (AVC)', h265: 'H.265 (HEVC)', av1: 'AV1',
    vp9: 'VP9', vp8: 'VP8', mpeg4: 'MPEG-4', mpeg2: 'MPEG-2', none: 'None (no video)',
    aac: 'AAC', 'he-aac': 'HE-AAC', mp3: 'MP3', mp2: 'MP2', flac: 'FLAC', ac3: 'AC-3',
    eac3: 'E-AC-3', opus: 'Opus', vorbis: 'Vorbis', alac: 'ALAC', pcm_s16le: 'PCM 16-bit', pcm_s24le: 'PCM 24-bit',
  };
  const HW_LABELS = { none: 'Software', videotoolbox: 'VideoToolbox (Apple)', nvenc: 'NVENC (NVIDIA)', qsv: 'Quick Sync (Intel)', vaapi: 'VAAPI' };

  // Built-in device presets.
  const DEVICE_PRESETS = {
    'Fast 1080p (H.264)':  { container: 'mp4',  videoCodec: 'h264', audioCodec: 'aac',  qualityMode: 'crf', crf: 21, speed: 'veryfast', scaleHeight: '1080' },
    'HQ 1080p (H.265)':    { container: 'mp4',  videoCodec: 'h265', audioCodec: 'aac',  qualityMode: 'crf', crf: 22, speed: 'medium',   scaleHeight: '1080' },
    'Phone / Tablet 720p': { container: 'mp4',  videoCodec: 'h264', audioCodec: 'aac',  qualityMode: 'crf', crf: 23, speed: 'fast',     scaleHeight: '720', audioBitrate: 128 },
    '4K HEVC (MKV)':       { container: 'mkv',  videoCodec: 'h265', audioCodec: 'aac',  qualityMode: 'crf', crf: 20, speed: 'slow',     scaleHeight: 'source' },
    'Web (WebM VP9)':      { container: 'webm', videoCodec: 'vp9',  audioCodec: 'opus', qualityMode: 'crf', crf: 31, speed: 'medium',   scaleHeight: '1080' },
    'AV1 small (MKV)':     { container: 'mkv',  videoCodec: 'av1',  audioCodec: 'opus', qualityMode: 'crf', crf: 30, speed: 'medium',   scaleHeight: 'source' },
    'Extract MP3':         { container: 'mp3',  audioCodec: 'mp3',  audioBitrate: 256 },
    'Extract FLAC':        { container: 'flac', audioCodec: 'flac' },
  };

  // -------------------------------------------------------------------------
  // Formatters
  // -------------------------------------------------------------------------
  function fmtSize(bytes) {
    if (!bytes) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0, n = bytes;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
  }
  function fmtTime(sec) {
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  // -------------------------------------------------------------------------
  // Small pure domain helpers (used by the renderer, tested directly)
  // -------------------------------------------------------------------------

  // Is a file (by extension, no dot) an accepted input?
  function isSupportedInput(ext) {
    return SUPPORTED_IN.includes(String(ext || '').replace(/^\./, '').toLowerCase());
  }

  // Effective duration after applying a trim window {start,end}.
  function effectiveTrimDuration(fullDuration, trim) {
    if (!fullDuration) return fullDuration;
    trim = trim || {};
    const start = trim.start || 0;
    if (trim.end > start) return trim.end - start;
    if (start) return Math.max(0, fullDuration - start);
    return fullDuration;
  }

  // Estimated output size in bytes for average-bitrate video mode. Returns null
  // when an estimate is not meaningful (CRF mode, audio-only container, or no
  // duration), mirroring the renderer's preview behaviour.
  function estimateSize(opts) {
    const { durationSec, qualityMode, containerKind, videoBitrate = 0, audioBitrate = 0 } = opts || {};
    if (!durationSec || qualityMode !== 'bitrate' || containerKind !== 'video') return null;
    const kbps = (videoBitrate || 0) + (audioBitrate || 0);
    return (kbps * 1000 / 8) * durationSec;
  }

  return {
    SUPPORTED_IN, CODEC_LABELS, HW_LABELS, DEVICE_PRESETS,
    fmtSize, fmtTime, escapeHtml, truncate,
    isSupportedInput, effectiveTrimDuration, estimateSize,
  };
});
