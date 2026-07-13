import { describe, it, expect } from 'vitest';
const core = require('../../src/convert-core');

const { CONTAINERS, VIDEO_ENC, AUDIO_ENC, HW_ENC } = core;

describe('CONTAINERS configuration integrity', () => {
  it('exposes the documented containers', () => {
    expect(Object.keys(CONTAINERS)).toEqual(
      expect.arrayContaining(['mp4', 'mkv', 'webm', 'avi', 'mpeg', 'wav', 'mp3', 'm4a', 'flac', 'opus', 'ogg'])
    );
  });

  it('every container defines kind, fmt, ext and a default audio codec', () => {
    for (const [name, c] of Object.entries(CONTAINERS)) {
      expect(['video', 'audio'], name).toContain(c.kind);
      expect(typeof c.fmt, name).toBe('string');
      expect(typeof c.ext, name).toBe('string');
      expect(c.da, name).toBeTruthy();
    }
  });

  it('video containers list video codecs and a default video codec inside that list', () => {
    for (const [name, c] of Object.entries(CONTAINERS)) {
      if (c.kind !== 'video') continue;
      expect(Array.isArray(c.video), name).toBe(true);
      expect(c.video, name).toContain(c.dv);
      expect(c.audio, name).toContain(c.da);
    }
  });

  it('every default codec has a known encoder mapping', () => {
    for (const [name, c] of Object.entries(CONTAINERS)) {
      if (c.dv) expect(VIDEO_ENC[c.dv], `${name}.dv`).toBeTruthy();
      // audio defaults may be pcm_* which map to themselves
      expect(AUDIO_ENC[c.da] || c.da, `${name}.da`).toBeTruthy();
    }
  });

  it('audio containers do not declare a subtitle codec', () => {
    for (const [name, c] of Object.entries(CONTAINERS)) {
      if (c.kind === 'audio') expect(c.subs, name).toBeUndefined();
    }
  });

  it('every hardware encoder key is "<accel>:<codec>" with a real codec', () => {
    const known = new Set(Object.keys(VIDEO_ENC));
    for (const key of Object.keys(HW_ENC)) {
      const [accel, codec] = key.split(':');
      expect(accel).toBeTruthy();
      expect(known.has(codec), key).toBe(true);
    }
  });
});
