import { describe, it, expect } from 'vitest';
const core = require('../../src/convert-core');
const { fakeCmd } = require('../helpers');

// Helper: run applyVideoQuality and return the flattened option token list.
function vq(encoder, s) {
  const c = fakeCmd();
  core.applyVideoQuality(c, encoder, { crf: 23, speed: 'medium', qualityMode: 'crf', ...s });
  return { opts: c.flatOpts(), bitrate: c.calls.videoBitrate };
}

describe('applyVideoQuality — constant quality (CRF)', () => {
  it('libx264/libx265 use -crf and -preset <speed>', () => {
    const x264 = vq('libx264', { crf: 20, speed: 'slow' });
    expect(x264.opts).toEqual(expect.arrayContaining(['-crf', '20', '-preset', 'slow']));
    const x265 = vq('libx265', { crf: 22, speed: 'fast' });
    expect(x265.opts).toEqual(expect.arrayContaining(['-crf', '22', '-preset', 'fast']));
  });

  it('SVT-AV1 uses -crf and a numeric -preset mapped from the speed name', () => {
    expect(vq('libsvtav1', { crf: 30, speed: 'medium' }).opts).toEqual(
      expect.arrayContaining(['-crf', '30', '-preset', '6'])
    );
    expect(vq('libsvtav1', { crf: 30, speed: 'veryslow' }).opts).toEqual(
      expect.arrayContaining(['-preset', '2'])
    );
  });

  it('VP9/VP8 use -crf with -b:v 0 and -cpu-used/-deadline/-row-mt', () => {
    const vp9 = vq('libvpx-vp9', { crf: 31, speed: 'medium' }).opts;
    expect(vp9).toEqual(expect.arrayContaining(['-crf', '31', '-b:v', '0', '-cpu-used', '3', '-deadline', 'good', '-row-mt', '1']));
    const vp8rt = vq('libvpx', { crf: 31, speed: 'ultrafast' }).opts;
    expect(vp8rt).toEqual(expect.arrayContaining(['-deadline', 'realtime', '-cpu-used', '8']));
  });

  it('NVENC uses -rc vbr -cq and a p-preset', () => {
    expect(vq('h264_nvenc', { crf: 24, speed: 'slow' }).opts).toEqual(
      expect.arrayContaining(['-rc', 'vbr', '-cq', '24', '-b:v', '0', '-preset', 'p6'])
    );
  });

  it('QSV uses -global_quality', () => {
    expect(vq('h264_qsv', { crf: 24 }).opts).toEqual(expect.arrayContaining(['-global_quality', '24']));
  });

  it('VAAPI uses CQP -qp', () => {
    expect(vq('h264_vaapi', { crf: 24 }).opts).toEqual(expect.arrayContaining(['-rc_mode', 'CQP', '-qp', '24']));
  });

  it('VideoToolbox maps CRF to an inverted -q:v scale', () => {
    // crf 0 -> ~100, crf 63 -> 0
    expect(vq('hevc_videotoolbox', { crf: 0 }).opts).toEqual(expect.arrayContaining(['-q:v', '100']));
    expect(vq('hevc_videotoolbox', { crf: 63 }).opts).toEqual(expect.arrayContaining(['-q:v', '0']));
  });

  it('MPEG-4/MPEG-2 map CRF to a 1..31 -q:v scale', () => {
    expect(vq('mpeg4', { crf: 23 }).opts).toEqual(expect.arrayContaining(['-q:v', '5']));
    expect(vq('mpeg2video', { crf: 0 }).opts).toEqual(expect.arrayContaining(['-q:v', '1']));
  });

  it('clamps out-of-range CRF before use', () => {
    expect(vq('libx264', { crf: 999 }).opts).toEqual(expect.arrayContaining(['-crf', '63']));
    expect(vq('libx264', { crf: -5 }).opts).toEqual(expect.arrayContaining(['-crf', '0']));
  });
});

describe('applyVideoQuality — average bitrate mode', () => {
  it('sets videoBitrate and does not emit -crf', () => {
    const c = fakeCmd();
    core.applyVideoQuality(c, 'libx264', { qualityMode: 'bitrate', videoBitrate: 6000, speed: 'medium' });
    expect(c.calls.videoBitrate).toEqual(['6000k']);
    expect(c.flatOpts()).not.toContain('-crf');
    // preset still applied for x264
    expect(c.flatOpts()).toEqual(expect.arrayContaining(['-preset', 'medium']));
  });

  it('defaults to 4000k when no bitrate provided', () => {
    const c = fakeCmd();
    core.applyVideoQuality(c, 'libx264', { qualityMode: 'bitrate', speed: 'medium' });
    expect(c.calls.videoBitrate).toEqual(['4000k']);
  });
});

describe('applyAudioQuality', () => {
  it('sets audio bitrate for lossy codecs', () => {
    const c = fakeCmd();
    core.applyAudioQuality(c, 'aac', { audioBitrate: 256 });
    expect(c.calls.audioBitrate).toEqual(['256k']);
  });

  it('defaults to 192k when no bitrate provided', () => {
    const c = fakeCmd();
    core.applyAudioQuality(c, 'mp3', {});
    expect(c.calls.audioBitrate).toEqual(['192k']);
  });

  it('adds the HE-AAC v2 profile', () => {
    const c = fakeCmd();
    core.applyAudioQuality(c, 'he-aac', { audioBitrate: 64 });
    expect(c.calls.audioBitrate).toEqual(['64k']);
    expect(c.flatOpts()).toEqual(expect.arrayContaining(['-profile:a', 'aac_he_v2']));
  });

  it('does NOT set a bitrate for lossless codecs', () => {
    for (const codec of ['flac', 'alac', 'pcm_s16le', 'pcm_s24le']) {
      const c = fakeCmd();
      core.applyAudioQuality(c, codec, { audioBitrate: 320 });
      expect(c.calls.audioBitrate).toEqual([]);
      expect(c.flatOpts()).toEqual([]);
    }
  });
});
