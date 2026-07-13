import { describe, it, expect } from 'vitest';
const core = require('../../src/convert-core');
const { baseSettings, makeCaps } = require('../helpers');

// Full-stack builder test: construct a real fluent-ffmpeg command and inspect
// the concrete argv it would pass to ffmpeg (without ever executing it).
const CAPS = makeCaps({ heAac: true, hw: ['videotoolbox:h264', 'videotoolbox:h265'] });

function args(overrides, inp = 'in.mkv', out = 'out.ext') {
  return core.buildCommand(inp, out, baseSettings(overrides), CAPS, null)._getArguments();
}
// True when `seq` appears in `arr` as a contiguous run (order-sensitive).
// ffmpeg args mix strings and numbers (e.g. -ss 5, -t 15, -r 24), so compare
// stringwise.
function hasSeq(arr, seq) {
  const s = arr.map(String);
  const want = seq.map(String);
  for (let i = 0; i + want.length <= s.length; i++) {
    if (want.every((v, j) => s[i + j] === v)) return true;
  }
  return false;
}

describe('buildCommand — video (MP4 / H.264 / AAC, default CRF)', () => {
  const a = args({});
  it('sets input, format and output', () => {
    expect(hasSeq(a, ['-i', 'in.mkv'])).toBe(true);
    expect(hasSeq(a, ['-f', 'mp4'])).toBe(true);
    expect(a[a.length - 1]).toBe('out.ext');
  });
  it('selects libx264 + aac with CRF/preset and SDR pixel format', () => {
    expect(hasSeq(a, ['-vcodec', 'libx264'])).toBe(true);
    expect(hasSeq(a, ['-acodec', 'aac'])).toBe(true);
    expect(hasSeq(a, ['-b:a', '192k'])).toBe(true);
    expect(hasSeq(a, ['-crf', '23'])).toBe(true);
    expect(hasSeq(a, ['-preset', 'medium'])).toBe(true);
    expect(hasSeq(a, ['-pix_fmt', 'yuv420p'])).toBe(true);
  });
  it('disables subtitles and copies chapters by default', () => {
    expect(a).toContain('-sn');
    expect(hasSeq(a, ['-map_chapters', '0'])).toBe(true);
  });
});

describe('buildCommand — stream copy (remux, no re-encode)', () => {
  const a = args({ videoCodec: 'copy', audioCodec: 'copy' });
  it('copies both streams and emits no quality flags', () => {
    expect(hasSeq(a, ['-vcodec', 'copy'])).toBe(true);
    expect(hasSeq(a, ['-acodec', 'copy'])).toBe(true);
    expect(a).not.toContain('-crf');
    expect(a).not.toContain('-b:a');
    expect(a).not.toContain('-pix_fmt');
  });
});

describe('buildCommand — dropping streams', () => {
  it('videoCodec "none" adds -vn but keeps audio', () => {
    const a = args({ videoCodec: 'none' });
    expect(a).toContain('-vn');
    expect(hasSeq(a, ['-acodec', 'aac'])).toBe(true);
    expect(a).not.toContain('-vcodec');
  });
  it('audioCodec "none" adds -an but keeps video', () => {
    const a = args({ audioCodec: 'none' });
    expect(a).toContain('-an');
    expect(hasSeq(a, ['-vcodec', 'libx264'])).toBe(true);
    expect(a).not.toContain('-b:a');
  });
});

describe('buildCommand — trim', () => {
  it('emits output-accurate -ss on input and -t for duration', () => {
    const a = args({ trim: { start: 5, end: 20 } });
    expect(hasSeq(a, ['-ss', '5'])).toBe(true);
    expect(hasSeq(a, ['-t', '15'])).toBe(true);
  });
  it('start only -> -ss with no -t', () => {
    const a = args({ trim: { start: 5, end: 0 } });
    expect(hasSeq(a, ['-ss', '5'])).toBe(true);
    expect(a).not.toContain('-t');
  });
  it('no trim -> neither -ss nor -t', () => {
    const a = args({ trim: { start: 0, end: 0 } });
    expect(a).not.toContain('-ss');
    expect(a).not.toContain('-t');
  });
});

describe('buildCommand — subtitles', () => {
  it('burn-in appends a subtitles filter and still disables subtitle streams', () => {
    const a = args({ subtitles: { mode: 'burn', file: '/s/a.srt' } });
    expect(hasSeq(a, ['-filter:v', "subtitles='/s/a.srt'"])).toBe(true);
    expect(a).toContain('-sn');
  });
  it('passthru maps the container subtitle codec (mov_text for mp4)', () => {
    const a = args({ subtitles: { mode: 'passthru' } });
    expect(hasSeq(a, ['-c:s', 'mov_text'])).toBe(true);
    expect(a).not.toContain('-sn');
  });
  it('passthru uses srt for mkv', () => {
    const a = args({ container: 'mkv', subtitles: { mode: 'passthru' } });
    expect(hasSeq(a, ['-c:s', 'srt'])).toBe(true);
  });
  it('none disables subtitles', () => {
    expect(args({ subtitles: { mode: 'none' } })).toContain('-sn');
  });
});

describe('buildCommand — chapters', () => {
  it('copyChapters false maps -1', () => {
    expect(hasSeq(args({ copyChapters: false }), ['-map_chapters', '-1'])).toBe(true);
  });
});

describe('buildCommand — hardware acceleration', () => {
  it('uses hevc_videotoolbox and its inverted -q:v scale', () => {
    const a = args({ container: 'mp4', videoCodec: 'h265', hwAccel: 'videotoolbox' });
    expect(hasSeq(a, ['-vcodec', 'hevc_videotoolbox'])).toBe(true);
    expect(hasSeq(a, ['-q:v', '63'])).toBe(true); // crf 23 -> round((63-23)/63*100)
  });
  it('falls back to software when the hardware combo is unavailable', () => {
    const caps = makeCaps({ hw: [] });
    const a = core.buildCommand('in.mkv', 'out', baseSettings({ videoCodec: 'h264', hwAccel: 'videotoolbox' }), caps, null)._getArguments();
    expect(hasSeq(a, ['-vcodec', 'libx264'])).toBe(true);
  });
});

describe('buildCommand — WebM (VP9 / Opus)', () => {
  const a = args({ container: 'webm', videoCodec: 'vp9', audioCodec: 'opus' }, 'in.mkv', 'out.webm');
  it('uses libvpx-vp9 + libopus and the VP9 CQ options', () => {
    expect(hasSeq(a, ['-vcodec', 'libvpx-vp9'])).toBe(true);
    expect(hasSeq(a, ['-acodec', 'libopus'])).toBe(true);
    expect(hasSeq(a, ['-crf', '23'])).toBe(true);
    expect(hasSeq(a, ['-b:v', '0'])).toBe(true);
    expect(hasSeq(a, ['-row-mt', '1'])).toBe(true);
    expect(hasSeq(a, ['-f', 'webm'])).toBe(true);
  });
});

describe('buildCommand — filters + frame rate', () => {
  it('renders the combined -filter:v chain', () => {
    const a = args({ filters: { scaleHeight: '720', grayscale: true } });
    expect(hasSeq(a, ['-filter:v', 'scale=-2:720,hue=s=0'])).toBe(true);
  });
  it('CFR sets -r', () => {
    expect(hasSeq(args({ fpsMode: 'cfr', fps: 24 }), ['-r', '24'])).toBe(true);
  });
  it('VFR sets -fps_mode vfr', () => {
    expect(hasSeq(args({ fpsMode: 'vfr' }), ['-fps_mode', 'vfr'])).toBe(true);
  });
});

describe('buildCommand — HDR passthrough', () => {
  it('adds BT.2020/PQ metadata and x265 hdr params for H.265', () => {
    const a = args({ container: 'mp4', videoCodec: 'h265', hdrPassthru: true });
    expect(hasSeq(a, ['-color_primaries', 'bt2020'])).toBe(true);
    expect(hasSeq(a, ['-color_trc', 'smpte2084'])).toBe(true);
    expect(hasSeq(a, ['-colorspace', 'bt2020nc'])).toBe(true);
    expect(a.some(x => typeof x === 'string' && x.includes('hdr-opt=1'))).toBe(true);
    // HDR path skips the forced 8-bit pixel format.
    expect(a).not.toContain('-pix_fmt');
  });
});

describe('buildCommand — audio-only containers', () => {
  it('WAV drops video and encodes PCM', () => {
    const a = args({ container: 'wav', audioCodec: 'copy' }, 'in.mp4', 'out.wav');
    expect(a).toContain('-vn');
    expect(hasSeq(a, ['-acodec', 'pcm_s16le'])).toBe(true);
    expect(hasSeq(a, ['-f', 'wav'])).toBe(true);
  });
  it('MP3 extraction uses libmp3lame at the chosen bitrate', () => {
    const a = args({ container: 'mp3', audioCodec: 'mp3', audioBitrate: 256 }, 'in.mp4', 'out.mp3');
    expect(a).toContain('-vn');
    expect(hasSeq(a, ['-acodec', 'libmp3lame'])).toBe(true);
    expect(hasSeq(a, ['-b:a', '256k'])).toBe(true);
  });
  it('FLAC extraction is lossless (no bitrate)', () => {
    const a = args({ container: 'flac', audioCodec: 'flac' }, 'in.mp4', 'out.flac');
    expect(hasSeq(a, ['-acodec', 'flac'])).toBe(true);
    expect(a).not.toContain('-b:a');
  });
  it('audio-only output never carries chapter/subtitle flags', () => {
    const a = args({ container: 'mp3', audioCodec: 'mp3' }, 'in.mp4', 'out.mp3');
    expect(a).not.toContain('-map_chapters');
    expect(a).not.toContain('-sn');
  });
});
