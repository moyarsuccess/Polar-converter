import { describe, it, expect } from 'vitest';
const core = require('../../src/convert-core');
const { makeCaps } = require('../helpers');

describe('resolveVideoEncoder', () => {
  it('maps logical codecs to their software encoders', () => {
    const caps = makeCaps();
    expect(core.resolveVideoEncoder('h264', 'none', caps)).toBe('libx264');
    expect(core.resolveVideoEncoder('h265', 'none', caps)).toBe('libx265');
    expect(core.resolveVideoEncoder('av1', 'none', caps)).toBe('libsvtav1');
    expect(core.resolveVideoEncoder('vp9', 'none', caps)).toBe('libvpx-vp9');
    expect(core.resolveVideoEncoder('vp8', 'none', caps)).toBe('libvpx');
    expect(core.resolveVideoEncoder('mpeg4', 'none', caps)).toBe('mpeg4');
    expect(core.resolveVideoEncoder('mpeg2', 'none', caps)).toBe('mpeg2video');
  });

  it('passes copy through untouched', () => {
    expect(core.resolveVideoEncoder('copy', 'videotoolbox', makeCaps({ hw: ['videotoolbox:h264'] }))).toBe('copy');
  });

  it('uses the hardware encoder when the accel+codec combo is available', () => {
    const caps = makeCaps({ hw: ['videotoolbox:h264', 'nvenc:h265'] });
    expect(core.resolveVideoEncoder('h264', 'videotoolbox', caps)).toBe('h264_videotoolbox');
    expect(core.resolveVideoEncoder('h265', 'nvenc', caps)).toBe('hevc_nvenc');
  });

  it('falls back to software when the hardware combo is unavailable', () => {
    const caps = makeCaps({ hw: [] }); // hardware detected as absent
    expect(core.resolveVideoEncoder('h264', 'videotoolbox', caps)).toBe('libx264');
  });

  it('falls back to software when accel has no encoder for that codec', () => {
    // videotoolbox has no AV1 entry -> software SVT-AV1.
    const caps = makeCaps({ hw: ['videotoolbox:h264'] });
    expect(core.resolveVideoEncoder('av1', 'videotoolbox', caps)).toBe('libsvtav1');
  });

  it('returns the codec itself when unknown', () => {
    expect(core.resolveVideoEncoder('mystery', 'none', makeCaps())).toBe('mystery');
  });
});

describe('resolveAudioEncoder', () => {
  it('maps logical codecs to encoders', () => {
    const caps = makeCaps();
    expect(core.resolveAudioEncoder('aac', caps)).toBe('aac');
    expect(core.resolveAudioEncoder('mp3', caps)).toBe('libmp3lame');
    expect(core.resolveAudioEncoder('opus', caps)).toBe('libopus');
    expect(core.resolveAudioEncoder('vorbis', caps)).toBe('libvorbis');
    expect(core.resolveAudioEncoder('flac', caps)).toBe('flac');
    expect(core.resolveAudioEncoder('alac', caps)).toBe('alac');
    expect(core.resolveAudioEncoder('pcm_s16le', caps)).toBe('pcm_s16le');
  });

  it('passes copy through untouched', () => {
    expect(core.resolveAudioEncoder('copy', makeCaps())).toBe('copy');
  });

  it('uses libfdk_aac for HE-AAC only when available, else plain aac', () => {
    expect(core.resolveAudioEncoder('he-aac', makeCaps({ heAac: true }))).toBe('libfdk_aac');
    expect(core.resolveAudioEncoder('he-aac', makeCaps({ heAac: false }))).toBe('aac');
  });

  it('returns the codec itself when unknown', () => {
    expect(core.resolveAudioEncoder('weirdcodec', makeCaps())).toBe('weirdcodec');
  });
});
