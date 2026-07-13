import { describe, it, expect } from 'vitest';
const core = require('../../src/convert-core');

// A representative slice of `ffmpeg -encoders` output.
const ENC_OUTPUT = `
 V..... libx264              libx264 H.264 / AVC
 V..... libx265              libx265 H.265 / HEVC
 V..... libsvtav1            SVT-AV1
 V..... libvpx-vp9           libvpx VP9
 V..... libvpx               libvpx VP8
 V..... mpeg4                MPEG-4 part 2
 V..... mpeg2video           MPEG-2 video
 V..... h264_videotoolbox    VideoToolbox H.264
 V..... hevc_videotoolbox    VideoToolbox HEVC
 A..... aac                  AAC
 A..... libmp3lame           MP3
 A..... mp2                  MP2
 A..... flac                 FLAC
 A..... ac3                  ATSC A/52A
 A..... eac3                 ATSC A/52 E-AC-3
 A..... libopus              libopus Opus
 A..... libvorbis            libvorbis Vorbis
 A..... alac                 ALAC
 A..... pcm_s16le            PCM signed 16-bit
 A..... pcm_s24le            PCM signed 24-bit
`;

describe('parseCapabilities', () => {
  const caps = core.parseCapabilities(ENC_OUTPUT, { platform: 'darwin', ffmpegPath: '/x/ffmpeg' });

  it('flags ffmpeg as usable and carries through metadata', () => {
    expect(caps.ffmpegOk).toBe(true);
    expect(caps.ffmpegPath).toBe('/x/ffmpeg');
    expect(caps.ffmpegSource).toBe('bundled');
  });

  it('detects the software video codecs present', () => {
    expect(caps.videoCodecs).toEqual(
      expect.arrayContaining(['h264', 'h265', 'av1', 'vp9', 'vp8', 'mpeg4', 'mpeg2'])
    );
  });

  it('detects the software audio codecs present', () => {
    expect(caps.audioCodecs).toEqual(
      expect.arrayContaining(['aac', 'mp3', 'mp2', 'flac', 'ac3', 'eac3', 'opus', 'vorbis', 'alac', 'pcm_s16le', 'pcm_s24le'])
    );
  });

  it('detects VideoToolbox as available and defaults to it on macOS', () => {
    expect(caps.hwAccels).toContain('videotoolbox');
    expect(caps.defaultAccel).toBe('videotoolbox');
    expect(caps.hwAvailable['videotoolbox:h264']).toBe(true);
    expect(caps.hwAvailable['videotoolbox:h265']).toBe(true);
  });

  it('does not report hardware encoders that are absent', () => {
    expect(caps.hwAccels).not.toContain('nvenc');
    expect(caps.hwAvailable['nvenc:h264']).toBeUndefined();
  });

  it('reports HE-AAC only when libfdk_aac is present', () => {
    expect(caps.heAac).toBe(false);
    const withFdk = core.parseCapabilities(ENC_OUTPUT + '\n A..... libfdk_aac  Fraunhofer FDK AAC');
    expect(withFdk.heAac).toBe(true);
  });

  it('picks nvenc as default on non-darwin when nvidia present', () => {
    const nv = core.parseCapabilities(ENC_OUTPUT + '\n V..... h264_nvenc NVENC', { platform: 'linux' });
    expect(nv.hwAccels).toContain('nvenc');
    expect(nv.defaultAccel).toBe('nvenc');
  });

  it('handles empty encoder output gracefully', () => {
    const none = core.parseCapabilities('', { platform: 'linux' });
    // No video encoder has a name equal to the logical codec, so none are
    // reported when ffmpeg lists nothing.
    expect(none.videoCodecs).toEqual([]);
    expect(none.hwAccels).toEqual([]);
    expect(none.defaultAccel).toBe('none');

    // NOTE (documents current behaviour): audio codecs whose encoder name is
    // identical to the logical codec name (aac, mp2, flac, ac3, eac3, alac,
    // pcm_s16le, pcm_s24le) are reported as available even with empty ffmpeg
    // output, because the parser treats `AUDIO_ENC[c] === c` as "present".
    // The encoders that go through a distinct library (mp3->libmp3lame,
    // opus->libopus, vorbis->libvorbis) are correctly absent here.
    expect(none.audioCodecs).not.toContain('mp3');
    expect(none.audioCodecs).not.toContain('opus');
    expect(none.audioCodecs).not.toContain('vorbis');
    expect(none.audioCodecs).toEqual(
      expect.arrayContaining(['aac', 'flac', 'ac3', 'pcm_s16le'])
    );
  });
});

describe('emptyCapabilities', () => {
  it('represents a missing ffmpeg', () => {
    const caps = core.emptyCapabilities('missing');
    expect(caps.ffmpegOk).toBe(false);
    expect(caps.ffmpegPath).toBeNull();
    expect(caps.videoCodecs).toEqual([]);
    expect(caps.hwAvailable).toEqual({});
    // hwCodecs table is still exposed for the renderer.
    expect(caps.hwCodecs['nvenc:av1']).toBe('av1_nvenc');
  });
});
