#!/usr/bin/env node
/**
 * fetch-ffmpeg.js
 * ---------------------------------------------------------------------------
 * Places self-contained ffmpeg + ffprobe binaries into resources/bin/ so that
 * electron-builder bundles them inside the packaged app. After this runs, the
 * shipped .app / .exe / .AppImage needs NOTHING installed on the end-user's
 * machine — ffmpeg travels inside the app.
 *
 * Strategy (in order):
 *   1. Copy from the ffmpeg-static / ffprobe-static npm packages if their
 *      binaries downloaded successfully during `npm install`.
 *   2. If those binaries are missing, try to (re)trigger their download.
 *   3. If everything fails (offline / proxy), print clear manual instructions.
 *
 * You only need to run this once per platform you build for:
 *     npm run fetch-ffmpeg
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'resources', 'bin');
const EXE = process.platform === 'win32' ? '.exe' : '';

function log(msg) { process.stdout.write(msg + '\n'); }

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

function tryResolveStatic() {
  let ffmpeg = null, ffprobe = null;
  try { ffmpeg = require('ffmpeg-static'); } catch (_) {}
  try { ffprobe = require('ffprobe-static').path; } catch (_) {}
  return { ffmpeg, ffprobe };
}

function copyBinary(src, destName) {
  if (!src || !fs.existsSync(src)) return false;
  const dest = path.join(OUT_DIR, destName + EXE);
  fs.copyFileSync(src, dest);
  if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
  const size = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
  log(`  ✔ ${destName}${EXE}  (${size} MB)  ← ${src}`);
  return true;
}

function main() {
  // --copy-only: used by the postinstall hook; never spawns a nested npm.
  const copyOnly = process.argv.includes('--copy-only');

  log('› Preparing standalone ffmpeg binaries…');
  ensureDir(OUT_DIR);

  let { ffmpeg, ffprobe } = tryResolveStatic();
  let okFf = copyBinary(ffmpeg, 'ffmpeg');
  let okFp = copyBinary(ffprobe, 'ffprobe');

  if (copyOnly) {
    if (okFf && okFp) log('✅ Bundled ffmpeg + ffprobe into resources/bin.');
    else log('ℹ️  Binaries not present yet — run `npm run fetch-ffmpeg` to fetch them.');
    process.exit(0);
  }

  // If a binary is missing, attempt to (re)download via the static packages.
  if (!okFf || !okFp) {
    log('› Some binaries were missing — attempting to (re)download…');
    try {
      execSync('npm rebuild ffmpeg-static ffprobe-static', { cwd: ROOT, stdio: 'inherit' });
    } catch (_) { /* handled below */ }
    // Clear require cache and retry the copy.
    for (const k of Object.keys(require.cache)) {
      if (/ffmpeg-static|ffprobe-static/.test(k)) delete require.cache[k];
    }
    ({ ffmpeg, ffprobe } = tryResolveStatic());
    if (!okFf) okFf = copyBinary(ffmpeg, 'ffmpeg');
    if (!okFp) okFp = copyBinary(ffprobe, 'ffprobe');
  }

  if (okFf && okFp) {
    log('\n✅ Done. resources/bin now contains ffmpeg + ffprobe.');
    log('   These are bundled by electron-builder (see "extraResources"),');
    log('   so the packaged app is fully standalone.');
    process.exit(0);
  }

  // Manual fallback instructions.
  log('\n⚠️  Could not obtain the binaries automatically (likely offline or a');
  log('    blocked network). Do this once, manually:');
  log('');
  log('    1. Download static builds of ffmpeg AND ffprobe for THIS platform:');
  log('         macOS:   https://evermeet.cx/ffmpeg/   (ffmpeg + ffprobe)');
  log('         Windows: https://www.gyan.dev/ffmpeg/builds/  (ffmpeg.exe, ffprobe.exe)');
  log('         Linux:   https://johnvansickle.com/ffmpeg/    (static build)');
  log('    2. Copy the executables into:');
  log(`         ${OUT_DIR}`);
  log(`       named exactly:  ffmpeg${EXE}  and  ffprobe${EXE}`);
  log('    3. Re-run:  npm start   (or  npm run dist  to package)');
  log('');
  process.exit(1);
}

main();
