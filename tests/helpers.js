// Shared test utilities.

// A minimal stand-in for a fluent-ffmpeg command that records the calls the
// quality helpers make, so applyVideoQuality/applyAudioQuality can be tested in
// isolation without constructing a real command.
function fakeCmd() {
  const calls = { outputOptions: [], videoBitrate: [], audioBitrate: [], videoFilters: [] };
  const c = {
    outputOptions(a) { calls.outputOptions.push(a); return c; },
    videoBitrate(a) { calls.videoBitrate.push(a); return c; },
    audioBitrate(a) { calls.audioBitrate.push(a); return c; },
    videoFilters(a) { calls.videoFilters.push(a); return c; },
    calls,
  };
  // Flatten every -flag value pair pushed via outputOptions into one array.
  c.flatOpts = () => calls.outputOptions.flat();
  return c;
}

// Build a capabilities object for the command builder / encoder resolver.
function makeCaps({ heAac = false, hw = [] } = {}) {
  return {
    ffmpegOk: true,
    heAac,
    hwAvailable: Object.fromEntries(hw.map(k => [k, true])),
  };
}

// A "reasonable defaults" settings object; override fields per-test.
function baseSettings(overrides = {}) {
  return {
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    hwAccel: 'none',
    qualityMode: 'crf',
    crf: 23,
    videoBitrate: 4000,
    audioBitrate: 192,
    speed: 'medium',
    scaleHeight: 'source',
    fpsMode: 'source',
    fps: 30,
    trim: { start: 0, end: 0 },
    filters: { deinterlace: 'off', denoise: 'off', detelecine: false, deblock: false, grayscale: false, colorspace: 'off' },
    subtitles: { mode: 'none', file: null },
    copyChapters: true,
    hdrPassthru: false,
    outputDir: null,
    ...overrides,
  };
}

module.exports = { fakeCmd, makeCaps, baseSettings };
