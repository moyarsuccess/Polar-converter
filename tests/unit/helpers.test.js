import { describe, it, expect } from 'vitest';
const core = require('../../src/convert-core');

describe('clamp', () => {
  it('returns the value when inside range', () => {
    expect(core.clamp(10, 0, 63)).toBe(10);
  });
  it('clamps below the minimum', () => {
    expect(core.clamp(-5, 0, 63)).toBe(0);
  });
  it('clamps above the maximum', () => {
    expect(core.clamp(999, 0, 63)).toBe(63);
  });
  it('accepts numeric strings', () => {
    expect(core.clamp('30', 0, 63)).toBe(30);
  });
  it('falls back to the low bound for non-numeric input', () => {
    expect(core.clamp('abc', 0, 63)).toBe(0);
    expect(core.clamp(undefined, 5, 63)).toBe(5);
    expect(core.clamp(NaN, 2, 63)).toBe(2);
  });
});

describe('timemarkToSeconds', () => {
  it('parses HH:MM:SS.ms', () => {
    expect(core.timemarkToSeconds('00:00:10.00')).toBeCloseTo(10);
    expect(core.timemarkToSeconds('01:02:03.5')).toBeCloseTo(3723.5);
  });
  it('handles zero', () => {
    expect(core.timemarkToSeconds('00:00:00.00')).toBe(0);
  });
  it('returns 0 for malformed input', () => {
    expect(core.timemarkToSeconds('nonsense')).toBe(0);
    expect(core.timemarkToSeconds('10:20')).toBe(0);
    expect(core.timemarkToSeconds('')).toBe(0);
  });
});

describe('effectiveDuration', () => {
  it('returns full duration with no trim', () => {
    expect(core.effectiveDuration(120, null)).toBe(120);
    expect(core.effectiveDuration(120, { start: 0, end: 0 })).toBe(120);
  });
  it('subtracts a start-only trim from the end', () => {
    expect(core.effectiveDuration(120, { start: 30, end: 0 })).toBe(90);
  });
  it('uses the trim window when start and end are set', () => {
    expect(core.effectiveDuration(120, { start: 10, end: 40 })).toBe(30);
  });
  it('ignores an end that is not after start', () => {
    expect(core.effectiveDuration(120, { start: 50, end: 20 })).toBe(70);
  });
  it('passes through a null full duration', () => {
    expect(core.effectiveDuration(null, { start: 10, end: 40 })).toBe(30);
  });
});

describe('escFilterPath', () => {
  it('escapes colons, quotes, backslashes and brackets', () => {
    expect(core.escFilterPath('C:\\subs\\file.srt')).toBe('C\\:\\\\subs\\\\file.srt');
    expect(core.escFilterPath("/path/[a]'b'.srt")).toBe("/path/\\[a\\]\\'b\\'.srt");
  });
  it('leaves a plain path untouched', () => {
    expect(core.escFilterPath('/home/user/subs.srt')).toBe('/home/user/subs.srt');
  });
});

describe('nextOutputPath', () => {
  it('returns base path when nothing exists', () => {
    const out = core.nextOutputPath('/out', 'movie', 'mp4', '/in/movie.mkv', () => false);
    expect(out).toBe('/out/movie.mp4');
  });
  it('increments the suffix while files collide', () => {
    const existing = new Set(['/out/movie.mp4', '/out/movie (1).mp4']);
    const out = core.nextOutputPath('/out', 'movie', 'mp4', '/in/movie.mkv', p => existing.has(p));
    expect(out).toBe('/out/movie (2).mp4');
  });
  it('allows writing over the input file itself (in-place re-encode)', () => {
    // The candidate equals the input path -> loop stops, no rename.
    const out = core.nextOutputPath('/in', 'movie', 'mp4', '/in/movie.mp4', () => true);
    expect(out).toBe('/in/movie.mp4');
  });
});
