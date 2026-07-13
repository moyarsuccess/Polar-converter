const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

const ffmpeg = require('fluent-ffmpeg');

// Pure conversion logic lives in a separate, Electron-free module so it can be
// unit-tested without launching the app. Everything format/codec/command
// related is delegated here.
const core = require('./src/convert-core');
const {
  CONTAINERS, HW_ENC, buildCommand, parseCapabilities, emptyCapabilities,
  effectiveDuration, nextOutputPath, timemarkToSeconds,
} = core;

// Resolve bundled ffmpeg / ffprobe binaries. When packaged inside an asar
// archive the paths point inside app.asar, so rewrite them to the unpacked dir.
function unpacked(p) {
  return p ? p.replace('app.asar', 'app.asar.unpacked') : p;
}

const EXE = process.platform === 'win32' ? '.exe' : '';

// Resolve ffmpeg/ffprobe in priority order so the packaged app is fully
// self-contained (end users install nothing):
//   1. Binaries shipped inside the app bundle  (Resources/bin — production)
//   2. resources/bin/ next to the source        (dev / `npm start`)
//   3. ffmpeg-static / ffprobe-static download   (if it succeeded)
//   4. A system install on PATH                  (last-resort fallback)
function resolveBinary(baseName, staticPath) {
  const exe = baseName + EXE;
  const candidates = [];

  if (app.isPackaged && process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'bin', exe));
  }
  candidates.push(path.join(__dirname, 'resources', 'bin', exe));
  if (staticPath) candidates.push(staticPath);

  for (const c of candidates) {
    try { if (c && fs.existsSync(c)) return { path: c, source: 'bundled' }; } catch (_) {}
  }

  // System fallback (kept only as a safety net; not required for end users).
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/opt/local/bin'].forEach(d => dirs.push(d));
  for (const d of dirs) {
    const cand = path.join(d, exe);
    try { if (fs.existsSync(cand)) return { path: cand, source: 'system' }; } catch (_) {}
  }
  return { path: null, source: 'missing' };
}

let staticFfmpeg = null, staticFfprobe = null;
try { staticFfmpeg = unpacked(require('ffmpeg-static')); } catch (_) {}
try { staticFfprobe = unpacked(require('ffprobe-static').path); } catch (_) {}

const ffmpegResolved = resolveBinary('ffmpeg', staticFfmpeg);
const ffprobeResolved = resolveBinary('ffprobe', staticFfprobe);
const ffmpegPath = ffmpegResolved.path;
const ffprobePath = ffprobeResolved.path;
const ffmpegSource = ffmpegResolved.source;

// Ensure the bundled binaries are executable (npm/zip can drop the +x bit).
for (const p of [ffmpegPath, ffprobePath]) {
  if (p && process.platform !== 'win32') { try { fs.chmodSync(p, 0o755); } catch (_) {} }
}

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath);

// ===========================================================================
// Capability detection (which encoders/hwaccels the bundled ffmpeg supports)
// ===========================================================================

let capabilitiesCache = null;

function runFfmpeg(args) {
  return new Promise((resolve) => {
    if (!ffmpegPath) return resolve('');
    execFile(ffmpegPath, args, { maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve((stdout || '') + (stderr || ''));
    });
  });
}

async function detectCapabilities() {
  if (capabilitiesCache) return capabilitiesCache;

  // No usable ffmpeg found — return an "empty" capability set with a clear flag.
  if (!ffmpegPath) {
    capabilitiesCache = emptyCapabilities(ffmpegSource);
    return capabilitiesCache;
  }

  const encOut = await runFfmpeg(['-hide_banner', '-encoders']);
  capabilitiesCache = parseCapabilities(encOut, {
    platform: process.platform, ffmpegSource, ffmpegPath,
  });
  return capabilitiesCache;
}

// ===========================================================================
// Window
// ===========================================================================

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120, height: 780, minWidth: 900, minHeight: 620,
    backgroundColor: '#0e0e12',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  detectCapabilities(); // warm the cache
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ===========================================================================
// IPC
// ===========================================================================

const activeJobs = new Map();

ipcMain.handle('get-capabilities', () => detectCapabilities());
ipcMain.handle('get-containers', () => CONTAINERS);

ipcMain.handle('pick-files', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Select media files',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Media', extensions: ['mp4', 'mpeg', 'mpg', 'wav', 'mkv', 'avi', 'mov', 'm4a', 'flac', 'webm', 'aac', 'ogg', 'opus', 'mp3', 'ts', 'm2ts', 'wmv', 'flv'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (res.canceled) return [];
  return Promise.all(res.filePaths.map(fileInfo));
});

ipcMain.handle('resolve-paths', async (_e, paths) => {
  const exist = (paths || []).filter(p => p && fs.existsSync(p));
  return Promise.all(exist.map(fileInfo));
});

ipcMain.handle('pick-subtitle', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Select subtitle file',
    properties: ['openFile'],
    filters: [{ name: 'Subtitles', extensions: ['srt', 'ass', 'ssa', 'vtt', 'sub'] }],
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('probe', (_e, filePath) => probe(filePath));

ipcMain.handle('thumbnail', async (_e, { filePath, time }) => {
  if (!fs.existsSync(filePath)) return null;
  const out = path.join(os.tmpdir(), `mc_thumb_${Date.now()}.jpg`);
  return new Promise((resolve) => {
    ffmpeg(filePath)
      .seekInput(Math.max(0, time || 0))
      .frames(1)
      .outputOptions(['-vf', 'scale=480:-2'])
      .output(out)
      .on('end', () => {
        try {
          const b64 = fs.readFileSync(out).toString('base64');
          fs.unlink(out, () => {});
          resolve(`data:image/jpeg;base64,${b64}`);
        } catch (_) { resolve(null); }
      })
      .on('error', () => resolve(null))
      .run();
  });
});

ipcMain.handle('pick-output-dir', async () => {
  const res = await dialog.showOpenDialog(mainWindow, { title: 'Choose output folder', properties: ['openDirectory', 'createDirectory'] });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('open-path', (_e, p) => { if (p) shell.showItemInFolder(p); });

ipcMain.handle('get-theme', () => nativeTheme.themeSource);
ipcMain.handle('set-theme', (_e, source) => {
  if (['system', 'light', 'dark'].includes(source)) nativeTheme.themeSource = source;
  return nativeTheme.themeSource;
});

ipcMain.handle('cancel-job', (_e, jobId) => {
  const cmd = activeJobs.get(jobId);
  if (cmd) { try { cmd.kill('SIGKILL'); } catch (_) {} activeJobs.delete(jobId); return true; }
  return false;
});

ipcMain.handle('convert', async (_e, { jobId, inputPath, settings }) => {
  const caps = await detectCapabilities();
  if (!caps.ffmpegOk) {
    const msg = 'FFmpeg binary is not bundled yet.';
    return { ok: false, error: msg, detail: 'Run `npm run fetch-ffmpeg` once in the project folder to place the binaries in resources/bin, then restart. After that the packaged app is fully standalone.' };
  }
  const container = CONTAINERS[settings.container];
  if (!container) return { ok: false, error: `Unsupported container: ${settings.container}` };
  if (!fs.existsSync(inputPath)) return { ok: false, error: 'Input file not found.' };

  const dir = settings.outputDir && fs.existsSync(settings.outputDir) ? settings.outputDir : path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  const outPath = nextOutputPath(dir, base, container.ext, inputPath);

  const meta = await probe(inputPath);
  const fullDur = meta ? meta.duration : null;
  const effDur = effectiveDuration(fullDur, settings.trim);

  return new Promise((resolve) => {
    let command;
    try {
      command = buildCommand(inputPath, outPath, settings, caps, effDur);
    } catch (err) {
      return resolve({ ok: false, error: 'Failed to build command: ' + err.message });
    }
    activeJobs.set(jobId, command);

    const tail = []; // keep last stderr lines for error reporting
    const log = (level, line) => {
      if (mainWindow) mainWindow.webContents.send('log', { jobId, level, line, name: base });
    };

    command
      .on('start', (cmdline) => {
        log('cmd', cmdline);
      })
      .on('stderr', (line) => {
        tail.push(line);
        if (tail.length > 200) tail.shift();
        log('info', line);
      })
      .on('progress', (p) => {
        let pct = null;
        if (effDur && p.timemark) pct = Math.min(99, Math.round((timemarkToSeconds(p.timemark) / effDur) * 100));
        else if (typeof p.percent === 'number') pct = Math.min(99, Math.round(p.percent));
        if (pct != null && mainWindow) mainWindow.webContents.send('progress', { jobId, percent: pct });
      })
      .on('end', () => {
        activeJobs.delete(jobId);
        log('ok', `✔ Finished → ${outPath}`);
        resolve({ ok: true, outPath });
      })
      .on('error', (err) => {
        activeJobs.delete(jobId);
        const cancelled = /SIGKILL|killed/i.test(err.message || '');
        // Surface the most informative ffmpeg lines, not just the generic wrapper message.
        const meaningful = tail.filter(l => /error|invalid|unable|not|fail|no such|unsupported|conversion/i.test(l)).slice(-4);
        const detail = meaningful.length ? meaningful.join(' | ') : (tail.slice(-2).join(' | ') || err.message);
        if (!cancelled) log('error', `✖ ${err.message}`);
        resolve({ ok: false, error: cancelled ? 'cancelled' : (err.message || 'Conversion failed'), detail, outPath });
      })
      .run();
  });
});

// ===========================================================================
// Helpers
// ===========================================================================

async function fileInfo(p) {
  let size = 0;
  try { size = fs.statSync(p).size; } catch (_) {}
  const meta = await probe(p);
  return {
    path: p, name: path.basename(p), ext: path.extname(p).replace('.', '').toLowerCase(),
    size,
    duration: meta ? meta.duration : null,
    width: meta ? meta.width : null,
    height: meta ? meta.height : null,
    hasVideo: meta ? meta.hasVideo : false,
    fps: meta ? meta.fps : null,
  };
}

function probe(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err || !data) return resolve(null);
      const v = (data.streams || []).find(s => s.codec_type === 'video' && s.disposition && s.disposition.attached_pic !== 1)
             || (data.streams || []).find(s => s.codec_type === 'video');
      let fps = null;
      if (v && v.avg_frame_rate && v.avg_frame_rate !== '0/0') {
        const [a, b] = v.avg_frame_rate.split('/').map(Number);
        if (b) fps = +(a / b).toFixed(3);
      }
      resolve({
        duration: data.format && data.format.duration ? Number(data.format.duration) : null,
        width: v ? v.width : null,
        height: v ? v.height : null,
        hasVideo: !!v,
        fps,
      });
    });
  });
}
