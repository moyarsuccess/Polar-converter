import { describe, it, expect } from 'vitest';
const MC = require('../../renderer/util.js');

describe('fmtSize', () => {
  it('shows 0 B for falsy sizes', () => {
    expect(MC.fmtSize(0)).toBe('0 B');
    expect(MC.fmtSize(null)).toBe('0 B');
  });
  it('formats bytes without decimals', () => {
    expect(MC.fmtSize(512)).toBe('512 B');
  });
  it('scales up units with one decimal below 10', () => {
    expect(MC.fmtSize(1536)).toBe('1.5 KB');
    expect(MC.fmtSize(1024 * 1024)).toBe('1.0 MB');
    expect(MC.fmtSize(5.5 * 1024 * 1024 * 1024)).toBe('5.5 GB');
  });
  it('drops the decimal at/above 10 units', () => {
    expect(MC.fmtSize(15 * 1024)).toBe('15 KB');
  });
});

describe('fmtTime', () => {
  it('formats under an hour as M:SS', () => {
    expect(MC.fmtTime(0)).toBe('0:00');
    expect(MC.fmtTime(65)).toBe('1:05');
    expect(MC.fmtTime(599)).toBe('9:59');
  });
  it('formats an hour or more as H:MM:SS', () => {
    expect(MC.fmtTime(3661)).toBe('1:01:01');
    expect(MC.fmtTime(3600)).toBe('1:00:00');
  });
  it('rounds fractional seconds', () => {
    expect(MC.fmtTime(65.4)).toBe('1:05');
    expect(MC.fmtTime(65.6)).toBe('1:06');
  });
});

describe('escapeHtml', () => {
  it('escapes the five HTML-sensitive characters', () => {
    expect(MC.escapeHtml(`<a href="x" data='y'>&`)).toBe('&lt;a href=&quot;x&quot; data=&#39;y&#39;&gt;&amp;');
  });
  it('coerces non-strings', () => {
    expect(MC.escapeHtml(42)).toBe('42');
  });
});

describe('truncate', () => {
  it('leaves short strings untouched', () => {
    expect(MC.truncate('short', 10)).toBe('short');
  });
  it('adds an ellipsis when longer than n', () => {
    expect(MC.truncate('abcdefghij', 5)).toBe('abcd…');
  });
});

describe('isSupportedInput', () => {
  it('accepts known media extensions regardless of case/dot', () => {
    expect(MC.isSupportedInput('mp4')).toBe(true);
    expect(MC.isSupportedInput('.MKV')).toBe(true);
    expect(MC.isSupportedInput('FLAC')).toBe(true);
  });
  it('rejects unknown extensions', () => {
    expect(MC.isSupportedInput('txt')).toBe(false);
    expect(MC.isSupportedInput('')).toBe(false);
    expect(MC.isSupportedInput(undefined)).toBe(false);
  });
});

describe('effectiveTrimDuration', () => {
  it('returns full duration with no trim', () => {
    expect(MC.effectiveTrimDuration(120, {})).toBe(120);
    expect(MC.effectiveTrimDuration(120, null)).toBe(120);
  });
  it('uses the window when end > start', () => {
    expect(MC.effectiveTrimDuration(120, { start: 10, end: 40 })).toBe(30);
  });
  it('subtracts a start-only trim', () => {
    expect(MC.effectiveTrimDuration(120, { start: 30 })).toBe(90);
  });
  it('passes through a null duration', () => {
    expect(MC.effectiveTrimDuration(null, { start: 10, end: 40 })).toBe(null);
  });
});

describe('estimateSize', () => {
  it('estimates bytes from combined bitrate in average-bitrate video mode', () => {
    // (4000 + 192) kbps over 60 s => (4192 * 1000 / 8) * 60
    expect(MC.estimateSize({ durationSec: 60, qualityMode: 'bitrate', containerKind: 'video', videoBitrate: 4000, audioBitrate: 192 }))
      .toBe((4192 * 1000 / 8) * 60);
  });
  it('returns null for CRF mode', () => {
    expect(MC.estimateSize({ durationSec: 60, qualityMode: 'crf', containerKind: 'video', videoBitrate: 4000 })).toBeNull();
  });
  it('returns null for audio-only containers', () => {
    expect(MC.estimateSize({ durationSec: 60, qualityMode: 'bitrate', containerKind: 'audio', audioBitrate: 256 })).toBeNull();
  });
  it('returns null without a duration', () => {
    expect(MC.estimateSize({ durationSec: 0, qualityMode: 'bitrate', containerKind: 'video', videoBitrate: 4000 })).toBeNull();
  });
});

describe('DEVICE_PRESETS', () => {
  it('every preset references a real container from the core config', () => {
    const { CONTAINERS } = require('../../src/convert-core');
    for (const [name, preset] of Object.entries(MC.DEVICE_PRESETS)) {
      expect(CONTAINERS[preset.container], name).toBeTruthy();
    }
  });
  it('audio-extraction presets omit a video codec', () => {
    expect(MC.DEVICE_PRESETS['Extract MP3'].videoCodec).toBeUndefined();
    expect(MC.DEVICE_PRESETS['Extract FLAC'].videoCodec).toBeUndefined();
  });
});
