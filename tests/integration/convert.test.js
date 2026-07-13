// Integration tests: build real ffmpeg commands with the core builder and
// actually execute them against a tiny synthetic clip, then probe the results.
//
// These require a runnable ffmpeg/ffprobe. The suite resolves one the same way
// the app does (bundled resources/bin -> ffmpeg-static -> system PATH) and
// SKIPS itself cleanly if none can run in the current environment.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const ffmpeg = require('fluent-ffmpeg');
const core = require('../../src/convert-core');
const { makeCaps, baseSettings } = require('../helpers');

const EXE = process.platform === 'win32' ? '.exe' : '';
const ROOT = path.resolve(__dirname, '../..');

function runnable(p) {
  if (!p) return false;
  try { return spawnSync(p, ['-version'], { timeout: 5000 }).status === 0; } catch (_) { return false; }
}
function firstRunnable(cands) {
  for (const c of cands) if (runnable(c)) return c;
  return null;
}

// Resolve ffmpeg + ffprobe the way the app does, but only accept a binary that
// actually executes on this platform.
function resolveBinaries() {
  let staticFf = null, staticProbe = null;
  try { staticFf = require('ffmpeg-static'); } catch (_) {}
  try { staticProbe = require('ffprobe-static').path; } catch (_) {}
  const ffmpegPath = firstRunnable([
    path.join(ROOT, 'resources', 'bin', 'ffmpeg' + EXE), staticFf, 'ffmpeg',
  ]);
  const ffprobePath = firstRunnable([
    path.join(ROOT, 'resources', 'bin', 'ffprobe' + EXE), staticProbe, 'ffprobe',
  ]);
  return { ffmpegPath, ffprobePath };
}

const { ffmpegPath, ffprobePath } = resolveBinaries();
const CAN_RUN = !!(ffmpegPath && ffprobePath);
const d = CAN_RUN ? describe : describe.skip;

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath);

const CAPS = makeCaps(); // software-only; libx264/aac/etc. exist in every build

function probe(file) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(file, (err, data) => {
      if (err || !data) return resolve(null);
      const v = (data.streams || []).find(s => s.codec_type === 'video');
      const a = (data.streams || []).find(s => s.codec_type === 'audio');
      resolve({
        duration: data.format && data.format.duration ? Number(data.format.duration) : null,
        hasVideo: !!v, hasAudio: !!a,
        width: v ? v.width : null, height: v ? v.height : null,
        vcodec: v ? v.codec_name : null, acodec: a ? a.codec_name : null,
      });
    });
  });
}

function convert(input, out, overrides) {
  const settings = baseSettings(overrides);
  return new Promise((resolve, reject) => {
    core.buildCommand(input, out, settings, CAPS, null)
      .on('end', () => resolve(out))
      .on('error', (e, _stdout, stderr) => reject(new Error((e && e.message) + ' :: ' + (stderr || ''))))
      .run();
  });
}

d('ffmpeg conversions (real execution)', () => {
  let workDir, source;

  beforeAll(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-int-'));
    source = path.join(workDir, 'source.mp4');
    // 2-second 160x120 test pattern + 440 Hz tone, encoded fast.
    execFileSync(ffmpegPath, [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=15:duration=2',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest', source,
    ], { timeout: 30000, stdio: ['ignore', 'ignore', 'pipe'] });
  });

  const fast = { crf: 34, speed: 'ultrafast', filters: { scaleHeight: '120' } };

  it('generated a valid source clip', async () => {
    const m = await probe(source);
    expect(m).not.toBeNull();
    expect(m.hasVideo).toBe(true);
    expect(m.hasAudio).toBe(true);
    expect(m.duration).toBeGreaterThan(1.5);
  });

  it('MP4 -> MKV (H.264 / AAC)', async () => {
    const out = path.join(workDir, 'out.mkv');
    await convert(source, out, { container: 'mkv', videoCodec: 'h264', audioCodec: 'aac', ...fast });
    const m = await probe(out);
    expect(fs.statSync(out).size).toBeGreaterThan(0);
    expect(m.hasVideo).toBe(true);
    expect(m.vcodec).toBe('h264');
    expect(m.duration).toBeGreaterThan(1.5);
  });

  it('MP4 -> AVI (MPEG-4 / MP3)', async () => {
    const out = path.join(workDir, 'out.avi');
    await convert(source, out, { container: 'avi', videoCodec: 'mpeg4', audioCodec: 'mp3', ...fast });
    const m = await probe(out);
    expect(m.hasVideo).toBe(true);
    expect(m.hasAudio).toBe(true);
  });

  it('extracts audio to MP3 (no video stream)', async () => {
    const out = path.join(workDir, 'audio.mp3');
    await convert(source, out, { container: 'mp3', audioCodec: 'mp3', audioBitrate: 128 });
    const m = await probe(out);
    expect(m.hasAudio).toBe(true);
    expect(m.hasVideo).toBe(false);
    expect(m.acodec).toMatch(/mp3/);
  });

  it('extracts audio to WAV (PCM)', async () => {
    const out = path.join(workDir, 'audio.wav');
    await convert(source, out, { container: 'wav', audioCodec: 'copy' });
    const m = await probe(out);
    expect(m.hasAudio).toBe(true);
    expect(m.hasVideo).toBe(false);
    expect(m.acodec).toMatch(/pcm/);
  });

  it('trims to ~1 second', async () => {
    const out = path.join(workDir, 'trim.mp4');
    await convert(source, out, { container: 'mp4', videoCodec: 'h264', trim: { start: 0, end: 1 }, ...fast });
    const m = await probe(out);
    expect(m.duration).toBeGreaterThan(0.7);
    expect(m.duration).toBeLessThan(1.5);
  });

  it('applies a scale filter (downscale to height 60)', async () => {
    const out = path.join(workDir, 'scaled.mp4');
    await convert(source, out, { container: 'mp4', videoCodec: 'h264', crf: 34, speed: 'ultrafast', filters: { scaleHeight: '60' } });
    const m = await probe(out);
    expect(m.height).toBe(60);
    expect(m.width % 2).toBe(0); // width kept even by scale=-2
  });

  it('drops audio when audioCodec is "none"', async () => {
    const out = path.join(workDir, 'noaudio.mp4');
    await convert(source, out, { container: 'mp4', videoCodec: 'h264', audioCodec: 'none', ...fast });
    const m = await probe(out);
    expect(m.hasVideo).toBe(true);
    expect(m.hasAudio).toBe(false);
  });

  it('grayscale filter produces a playable file', async () => {
    const out = path.join(workDir, 'gray.mp4');
    await convert(source, out, { container: 'mp4', videoCodec: 'h264', crf: 34, speed: 'ultrafast', filters: { grayscale: true, scaleHeight: '120' } });
    const m = await probe(out);
    expect(m.hasVideo).toBe(true);
    expect(fs.statSync(out).size).toBeGreaterThan(0);
  });
});
