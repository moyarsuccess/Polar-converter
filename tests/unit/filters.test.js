import { describe, it, expect } from 'vitest';
const core = require('../../src/convert-core');

const F = (filters) => core.buildVideoFilters({ filters });

describe('buildVideoFilters', () => {
  it('returns no filters for an empty/default filter set', () => {
    expect(F({})).toEqual([]);
    expect(core.buildVideoFilters({})).toEqual([]);
    expect(F({ deinterlace: 'off', denoise: 'off', colorspace: 'off' })).toEqual([]);
  });

  it('adds yadif for deinterlace', () => {
    expect(F({ deinterlace: 'yadif' })).toEqual(['yadif']);
  });

  it('adds bwdif for decomb', () => {
    expect(F({ deinterlace: 'bwdif' })).toEqual(['bwdif']);
  });

  it('detelecine takes precedence and expands to the inverse-telecine chain', () => {
    expect(F({ detelecine: true, deinterlace: 'yadif' })).toEqual([
      'fieldmatch', 'yadif=deint=interlaced', 'decimate',
    ]);
  });

  it('maps denoise levels to hqdn3d presets', () => {
    expect(F({ denoise: 'light' })).toEqual(['hqdn3d=2:1:2:3']);
    expect(F({ denoise: 'medium' })).toEqual(['hqdn3d=4:3:6:4.5']);
    expect(F({ denoise: 'strong' })).toEqual(['hqdn3d=8:6:12:9']);
  });

  it('adds deblock', () => {
    expect(F({ deblock: true })).toEqual(['deblock']);
  });

  it('adds a crop expression w:h:x:y (x/y default to 0)', () => {
    expect(F({ crop: { w: 1280, h: 720 } })).toEqual(['crop=1280:720:0:0']);
    expect(F({ crop: { w: 1280, h: 720, x: 10, y: 20 } })).toEqual(['crop=1280:720:10:20']);
  });

  it('ignores an incomplete crop', () => {
    expect(F({ crop: { w: 1280 } })).toEqual([]);
    expect(F({ crop: {} })).toEqual([]);
  });

  it('adds height-driven scale and skips "source"', () => {
    expect(F({ scaleHeight: '720' })).toEqual(['scale=-2:720']);
    expect(F({ scaleHeight: 'source' })).toEqual([]);
  });

  it('adds grayscale via hue', () => {
    expect(F({ grayscale: true })).toEqual(['hue=s=0']);
  });

  it('adds BT.709 colourspace conversion + pixel format', () => {
    expect(F({ colorspace: 'bt709' })).toEqual([
      'scale=in_color_matrix=auto:out_color_matrix=bt709', 'format=yuv420p',
    ]);
  });

  it('preserves canonical ordering when multiple filters combine', () => {
    const out = F({
      deinterlace: 'yadif',
      denoise: 'medium',
      deblock: true,
      crop: { w: 1920, h: 800, x: 0, y: 140 },
      scaleHeight: '1080',
      grayscale: true,
      colorspace: 'bt709',
    });
    expect(out).toEqual([
      'yadif',
      'hqdn3d=4:3:6:4.5',
      'deblock',
      'crop=1920:800:0:140',
      'scale=-2:1080',
      'hue=s=0',
      'scale=in_color_matrix=auto:out_color_matrix=bt709',
      'format=yuv420p',
    ]);
  });
});
