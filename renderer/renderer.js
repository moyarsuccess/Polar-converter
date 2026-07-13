// ===========================================================================
// State
// ===========================================================================
const state = {
  files: [],          // { id, path, name, ext, size, duration, width, height, hasVideo, fps, status, percent, outPath, ... }
  selectedId: null,
  caps: null,
  containers: null,
  converting: false,
  settings: {
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
  },
};

let idSeq = 1;

// Shared, pure helpers + constants live in util.js (loaded first) under the
// global `MC` namespace so they can be unit-tested independently of the DOM.
const { SUPPORTED_IN, CODEC_LABELS, HW_LABELS, DEVICE_PRESETS, fmtSize, fmtTime, escapeHtml, truncate } = MC;

// ===========================================================================
// Elements
// ===========================================================================
const $ = (id) => document.getElementById(id);
const el = {
  dropzone: $('dropzone'), browseBtn: $('browseBtn'), fileList: $('fileList'),
  preview: $('preview'), previewImg: $('previewImg'), previewEmpty: $('previewEmpty'), previewMeta: $('previewMeta'),
  presetSelect: $('presetSelect'), savePresetBtn: $('savePresetBtn'), delPresetBtn: $('delPresetBtn'),
  formatPills: $('formatPills'),
  videoCodec: $('videoCodec'), audioCodec: $('audioCodec'), hwAccel: $('hwAccel'),
  videoCodecField: $('videoCodecField'), hwField: $('hwField'), codecCard: $('codecCard'),
  qualityMode: $('qualityMode'), crf: $('crf'), crfVal: $('crfVal'), crfWrap: $('crfWrap'),
  vbWrap: $('vbWrap'), videoBitrate: $('videoBitrate'), speed: $('speed'), speedField: $('speedField'),
  abField: $('abField'), audioBitrate: $('audioBitrate'),
  scaleHeight: $('scaleHeight'), fpsMode: $('fpsMode'), fps: $('fps'), fpsWrap: $('fpsWrap'),
  trimStart: $('trimStart'), trimEnd: $('trimEnd'),
  deinterlace: $('deinterlace'), denoise: $('denoise'), detelecine: $('detelecine'), deblock: $('deblock'), grayscale: $('grayscale'), colorspace: $('colorspace'),
  subMode: $('subMode'), subFileWrap: $('subFileWrap'), pickSubBtn: $('pickSubBtn'),
  copyChapters: $('copyChapters'), hdrPassthru: $('hdrPassthru'),
  outputPath: $('outputPath'), chooseDirBtn: $('chooseDirBtn'),
  clearBtn: $('clearBtn'), convertBtn: $('convertBtn'), summary: $('summary'),
  logToggle: $('logToggle'), logDock: $('logDock'), logBody: $('logBody'), logHead: $('logHead'),
  logCount: $('logCount'), minLogBtn: $('minLogBtn'), maxLogBtn: $('maxLogBtn'),
  clearLogBtn: $('clearLogBtn'), copyLogBtn: $('copyLogBtn'),
};

// Log dock state: 'collapsed' | 'normal' | 'max'
function setLogState(s) {
  el.logDock.classList.remove('collapsed', 'normal', 'max');
  el.logDock.classList.add(s);
  el.maxLogBtn.title = s === 'max' ? 'Restore' : 'Maximize';
  if (s !== 'collapsed') el.logDock.classList.remove('hasError');
}
function isLogOpen() { return !el.logDock.classList.contains('collapsed'); }

// ===========================================================================
// Boot
// ===========================================================================
async function boot() {
  [state.caps, state.containers] = await Promise.all([
    window.api.getCapabilities(),
    window.api.getContainers(),
  ]);
  initTheme();
  buildFormatPills();
  buildPresetList();
  applyContainerToUI();      // populate codec dropdowns
  bindControls();
  syncControlsFromSettings();
  render();

  if (!state.caps.ffmpegOk) {
    log('error', 'FFmpeg binary not bundled yet — nothing to convert with.');
    log('info', 'One-time setup: run `npm run fetch-ffmpeg` in the project folder, then restart. The binary is then packaged inside the app, so end users install nothing.');
    setLogState('normal');
    el.convertBtn.disabled = true;
    el.convertBtn.textContent = 'FFmpeg missing';
  } else {
    log('ok', `Engine ready (${state.caps.ffmpegSource} FFmpeg): ${state.caps.ffmpegPath}`);
    log('info', `Video codecs: ${state.caps.videoCodecs.join(', ') || 'none'}. HW: ${state.caps.hwAccels.length ? state.caps.hwAccels.join(', ') : 'none detected'}.`);
  }
}

// ===========================================================================
// Theme
// ===========================================================================
async function initTheme() {
  const current = await window.api.getTheme();
  applyThemeUI(current); reflectSystem(current);
}
function applyThemeUI(source) {
  document.querySelectorAll('[data-theme-btn]').forEach(b => b.classList.toggle('active', b.dataset.themeBtn === source));
}
function reflectSystem(source) {
  let eff = source;
  if (source === 'system') eff = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', eff);
}
document.querySelectorAll('[data-theme-btn]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const source = await window.api.setTheme(btn.dataset.themeBtn);
    applyThemeUI(source); reflectSystem(source);
  });
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
  if ((await window.api.getTheme()) === 'system') reflectSystem('system');
});

// ===========================================================================
// Format pills & codec dropdowns (capability-aware)
// ===========================================================================
function buildFormatPills() {
  const order = ['mp4', 'mkv', 'webm', 'avi', 'mpeg', 'wav', 'mp3', 'm4a', 'flac', 'opus', 'ogg'];
  el.formatPills.innerHTML = '';
  order.forEach(key => {
    if (!state.containers[key]) return;
    const b = document.createElement('button');
    b.className = 'pill' + (key === state.settings.container ? ' active' : '');
    b.dataset.format = key;
    b.textContent = key.toUpperCase();
    b.addEventListener('click', () => {
      state.settings.container = key;
      el.formatPills.querySelectorAll('.pill').forEach(p => p.classList.toggle('active', p === b));
      applyContainerToUI();
      render();
    });
    el.formatPills.appendChild(b);
  });
}

function fillSelect(sel, values, current, labels) {
  sel.innerHTML = '';
  values.forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = labels[v] || v;
    if (v === current) o.selected = true;
    sel.appendChild(o);
  });
}

// When the container changes, rebuild codec options constrained by container + engine capabilities.
function applyContainerToUI() {
  const c = state.containers[state.settings.container];
  const isAudio = c.kind === 'audio';

  // Show/hide video-only cards.
  document.querySelectorAll('.videoOnly').forEach(n => n.classList.toggle('hidden', isAudio));
  el.videoCodecField.classList.toggle('hidden', isAudio);
  el.hwField.classList.toggle('hidden', isAudio);

  if (!isAudio) {
    // Video codecs allowed by container ∩ engine, plus copy/none.
    const vids = c.video.filter(v => state.caps.videoCodecs.includes(v));
    const videoOpts = ['copy', ...vids, 'none'];
    if (!videoOpts.includes(state.settings.videoCodec)) state.settings.videoCodec = c.dv;
    fillSelect(el.videoCodec, videoOpts, state.settings.videoCodec, CODEC_LABELS);

    // Hardware accel options that can encode the current codec.
    const accels = ['none', ...state.caps.hwAccels.filter(a => state.caps.hwCodecs[`${a}:${state.settings.videoCodec}`] && state.caps.hwAvailable[`${a}:${state.settings.videoCodec}`])];
    if (!accels.includes(state.settings.hwAccel)) state.settings.hwAccel = 'none';
    fillSelect(el.hwAccel, accels, state.settings.hwAccel, HW_LABELS);
    el.hwField.style.display = accels.length > 1 ? '' : 'none';
  }

  // Audio codecs (container ∩ engine), plus copy for video containers.
  const auds = c.audio.filter(a => state.caps.audioCodecs.includes(a) || a.startsWith('pcm'));
  const audioOpts = isAudio ? auds : ['copy', ...auds, 'none'];
  if (!audioOpts.includes(state.settings.audioCodec)) state.settings.audioCodec = c.da;
  fillSelect(el.audioCodec, audioOpts, state.settings.audioCodec, CODEC_LABELS);

  updateConditionalFields();
  updateEstimate();
}

// ===========================================================================
// Presets
// ===========================================================================
function getCustomPresets() {
  try { return JSON.parse(localStorage.getItem('customPresets') || '{}'); } catch (_) { return {}; }
}
function buildPresetList() {
  const custom = getCustomPresets();
  el.presetSelect.innerHTML = '';
  const add = (label, group) => {
    const o = document.createElement('option'); o.value = (group ? group + ':' : '') + label; o.textContent = label; return o;
  };
  const cur = document.createElement('optgroup'); cur.label = 'Current'; cur.appendChild(add('Custom settings', 'current')); el.presetSelect.appendChild(cur);
  const dev = document.createElement('optgroup'); dev.label = 'Device presets';
  Object.keys(DEVICE_PRESETS).forEach(k => dev.appendChild(add(k, 'device')));
  el.presetSelect.appendChild(dev);
  const keys = Object.keys(custom);
  if (keys.length) {
    const my = document.createElement('optgroup'); my.label = 'My presets';
    keys.forEach(k => my.appendChild(add(k, 'custom')));
    el.presetSelect.appendChild(my);
  }
}
el && el.presetSelect; // (guard for lint)

function applyPreset(patch) {
  // Merge shallow settings, then re-derive UI.
  Object.assign(state.settings, patch);
  if (!state.settings.filters) state.settings.filters = {};
  buildFormatPills();
  applyContainerToUI();
  syncControlsFromSettings();
  render();
}

// ===========================================================================
// Control binding
// ===========================================================================
function bindControls() {
  el.presetSelect.addEventListener('change', () => {
    const val = el.presetSelect.value;
    if (val.startsWith('device:')) applyPreset(DEVICE_PRESETS[val.slice(7)]);
    else if (val.startsWith('custom:')) applyPreset(getCustomPresets()[val.slice(7)]);
  });
  el.savePresetBtn.addEventListener('click', () => {
    const name = prompt('Preset name:');
    if (!name) return;
    const custom = getCustomPresets();
    custom[name] = JSON.parse(JSON.stringify(state.settings));
    delete custom[name].outputDir; delete custom[name].trim;
    localStorage.setItem('customPresets', JSON.stringify(custom));
    buildPresetList();
    el.presetSelect.value = 'custom:' + name;
  });
  el.delPresetBtn.addEventListener('click', () => {
    const val = el.presetSelect.value;
    if (!val.startsWith('custom:')) return;
    const custom = getCustomPresets(); delete custom[val.slice(7)];
    localStorage.setItem('customPresets', JSON.stringify(custom));
    buildPresetList();
  });

  el.videoCodec.addEventListener('change', () => {
    state.settings.videoCodec = el.videoCodec.value;
    applyContainerToUI(); render();
  });
  el.audioCodec.addEventListener('change', () => { state.settings.audioCodec = el.audioCodec.value; updateConditionalFields(); updateEstimate(); });

  el.hwAccel.addEventListener('change', () => { state.settings.hwAccel = el.hwAccel.value; });

  el.qualityMode.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    state.settings.qualityMode = b.dataset.qmode;
    el.qualityMode.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    updateConditionalFields(); updateEstimate();
  }));
  el.crf.addEventListener('input', () => { state.settings.crf = +el.crf.value; el.crfVal.textContent = el.crf.value; });
  el.videoBitrate.addEventListener('input', () => { state.settings.videoBitrate = +el.videoBitrate.value; updateEstimate(); });
  el.speed.addEventListener('change', () => { state.settings.speed = el.speed.value; });
  el.audioBitrate.addEventListener('change', () => { state.settings.audioBitrate = +el.audioBitrate.value; updateEstimate(); });

  el.scaleHeight.addEventListener('change', () => { state.settings.scaleHeight = el.scaleHeight.value; });
  el.fpsMode.addEventListener('change', () => { state.settings.fpsMode = el.fpsMode.value; updateConditionalFields(); });
  el.fps.addEventListener('change', () => { state.settings.fps = +el.fps.value; });

  el.trimStart.addEventListener('input', () => { state.settings.trim.start = +el.trimStart.value || 0; updateEstimate(); });
  el.trimEnd.addEventListener('input', () => { state.settings.trim.end = +el.trimEnd.value || 0; updateEstimate(); });

  el.deinterlace.addEventListener('change', () => { state.settings.filters.deinterlace = el.deinterlace.value; });
  el.denoise.addEventListener('change', () => { state.settings.filters.denoise = el.denoise.value; });
  el.detelecine.addEventListener('change', () => { state.settings.filters.detelecine = el.detelecine.checked; });
  el.deblock.addEventListener('change', () => { state.settings.filters.deblock = el.deblock.checked; });
  el.grayscale.addEventListener('change', () => { state.settings.filters.grayscale = el.grayscale.checked; });
  el.colorspace.addEventListener('change', () => { state.settings.filters.colorspace = el.colorspace.checked ? 'bt709' : 'off'; });

  el.subMode.addEventListener('change', () => {
    state.settings.subtitles.mode = el.subMode.value;
    el.subFileWrap.classList.toggle('hidden', el.subMode.value !== 'burn');
  });
  el.pickSubBtn.addEventListener('click', async () => {
    const f = await window.api.pickSubtitle();
    if (f) { state.settings.subtitles.file = f; el.pickSubBtn.textContent = f.split(/[\\/]/).pop(); }
  });
  el.copyChapters.addEventListener('change', () => { state.settings.copyChapters = el.copyChapters.checked; });
  el.hdrPassthru.addEventListener('change', () => { state.settings.hdrPassthru = el.hdrPassthru.checked; });

  // Files
  el.browseBtn.addEventListener('click', async (e) => { e.stopPropagation(); addFiles(await window.api.pickFiles()); });
  el.dropzone.addEventListener('click', async () => addFiles(await window.api.pickFiles()));
  el.chooseDirBtn.addEventListener('click', async () => {
    const dir = await window.api.pickOutputDir();
    if (dir) { state.settings.outputDir = dir; el.outputPath.textContent = dir; }
  });
  el.clearBtn.addEventListener('click', () => { if (!state.converting) { state.files = []; state.selectedId = null; clearPreview(); render(); } });
  el.convertBtn.addEventListener('click', convertAll);

  // Log dock (bottom, minimize / maximize inside the window)
  el.logToggle.addEventListener('click', () => setLogState(isLogOpen() ? 'collapsed' : 'normal'));
  el.logHead.addEventListener('click', (e) => { if (!e.target.closest('button')) setLogState(isLogOpen() ? 'collapsed' : 'normal'); });
  el.minLogBtn.addEventListener('click', (e) => { e.stopPropagation(); setLogState(isLogOpen() ? 'collapsed' : 'normal'); });
  el.maxLogBtn.addEventListener('click', (e) => { e.stopPropagation(); setLogState(el.logDock.classList.contains('max') ? 'normal' : 'max'); });
  el.clearLogBtn.addEventListener('click', (e) => { e.stopPropagation(); el.logBody.innerHTML = ''; el.logCount.textContent = ''; });
  el.copyLogBtn.addEventListener('click', (e) => { e.stopPropagation(); navigator.clipboard.writeText(el.logBody.textContent); });

  // Drag & drop
  ['dragenter', 'dragover'].forEach(evt => el.dropzone.addEventListener(evt, e => { e.preventDefault(); el.dropzone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(evt => el.dropzone.addEventListener(evt, e => { e.preventDefault(); el.dropzone.classList.remove('dragover'); }));
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault(); el.dropzone.classList.remove('dragover');
    const paths = [];
    for (const f of e.dataTransfer.files) { const p = window.api.getPathForFile(f); if (p) paths.push(p); }
    if (paths.length) addFiles(await window.api.resolvePaths(paths));
  });
}

// Reflect settings object back into every control (used by presets).
function syncControlsFromSettings() {
  const s = state.settings;
  el.videoCodec.value = s.videoCodec;
  el.audioCodec.value = s.audioCodec;
  el.hwAccel.value = s.hwAccel;
  el.qualityMode.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.qmode === s.qualityMode));
  el.crf.value = s.crf; el.crfVal.textContent = s.crf;
  el.videoBitrate.value = s.videoBitrate;
  el.speed.value = s.speed;
  el.audioBitrate.value = s.audioBitrate;
  el.scaleHeight.value = s.scaleHeight;
  el.fpsMode.value = s.fpsMode; el.fps.value = s.fps;
  el.trimStart.value = s.trim.start || '';
  el.trimEnd.value = s.trim.end || '';
  el.deinterlace.value = s.filters.deinterlace;
  el.denoise.value = s.filters.denoise;
  el.detelecine.checked = !!s.filters.detelecine;
  el.deblock.checked = !!s.filters.deblock;
  el.grayscale.checked = !!s.filters.grayscale;
  el.colorspace.checked = s.filters.colorspace === 'bt709';
  el.subMode.value = s.subtitles.mode;
  el.subFileWrap.classList.toggle('hidden', s.subtitles.mode !== 'burn');
  el.copyChapters.checked = s.copyChapters;
  el.hdrPassthru.checked = s.hdrPassthru;
  el.outputPath.textContent = s.outputDir || 'Same folder as source';
  updateConditionalFields();
}

// Enable/disable fields that only apply in certain modes.
function updateConditionalFields() {
  const s = state.settings;
  const copyV = s.videoCodec === 'copy' || s.videoCodec === 'none';
  el.crfWrap.classList.toggle('hidden', s.qualityMode !== 'crf');
  el.vbWrap.classList.toggle('hidden', s.qualityMode !== 'bitrate');
  el.speedField.classList.toggle('hidden', copyV);
  el.qualityMode.classList.toggle('hidden', copyV);

  // Audio bitrate irrelevant for lossless/copy/none.
  const lossless = ['flac', 'alac', 'pcm_s16le', 'pcm_s24le', 'copy', 'none'].includes(s.audioCodec);
  el.abField.classList.toggle('hidden', lossless);

  el.fpsWrap.classList.toggle('hidden', s.fpsMode !== 'cfr');
}

// ===========================================================================
// Files
// ===========================================================================
async function addFiles(infos) {
  let firstNew = null;
  for (const info of infos || []) {
    if (!info || !SUPPORTED_IN.includes(info.ext)) continue;
    if (state.files.some(f => f.path === info.path)) continue;
    const f = { id: idSeq++, ...info, status: 'ready', percent: 0, outPath: null };
    state.files.push(f);
    if (!firstNew) firstNew = f;
  }
  render();
  if (firstNew && !state.selectedId) selectFile(firstNew.id);
}

async function selectFile(id) {
  state.selectedId = id;
  render();
  const f = state.files.find(x => x.id === id);
  if (!f) return;
  el.previewEmpty.textContent = 'Loading preview…';
  el.previewEmpty.hidden = false; el.previewImg.hidden = true;
  const dims = f.width ? `${f.width}×${f.height}` : 'audio';
  const dur = f.duration ? fmtTime(f.duration) : '—';
  el.previewMeta.textContent = `${f.ext.toUpperCase()} · ${dims} · ${dur} · ${f.fps ? f.fps + 'fps · ' : ''}${fmtSize(f.size)}`;
  el.previewMeta.classList.add('show');
  if (f.hasVideo) {
    const time = state.settings.trim.start || Math.min(1, (f.duration || 2) / 2);
    const data = await window.api.thumbnail(f.path, time);
    if (state.selectedId === id) {
      if (data) { el.previewImg.src = data; el.previewImg.hidden = false; el.previewEmpty.hidden = true; }
      else { el.previewEmpty.textContent = 'No preview available'; }
    }
  } else {
    el.previewEmpty.textContent = '♪ Audio file';
  }
  updateEstimate();
}

function clearPreview() {
  el.previewImg.hidden = true; el.previewEmpty.hidden = false;
  el.previewEmpty.textContent = 'Select a file to preview';
  el.previewMeta.classList.remove('show');
}

// ===========================================================================
// Convert
// ===========================================================================
async function convertAll() {
  if (state.converting) return;
  const queue = state.files.filter(f => f.status === 'ready' || f.status === 'error');
  if (!queue.length) return;
  state.converting = true; updateActionBar();

  for (const file of queue) {
    file.status = 'working'; file.percent = 0; file.startedAt = Date.now();
    file.jobId = `job-${file.id}-${Date.now()}`;
    render();

    const res = await window.api.convert({
      jobId: file.jobId,
      inputPath: file.path,
      settings: JSON.parse(JSON.stringify(state.settings)),
    });

    if (res.ok) { file.status = 'done'; file.percent = 100; file.outPath = res.outPath; }
    else if (res.error === 'cancelled') { file.status = 'ready'; }
    else {
      file.status = 'error'; file.errorMsg = res.error; file.errorDetail = res.detail || res.error;
      log('error', `${file.name}: ${res.detail || res.error}`);
      if (!isLogOpen()) { setLogState('normal'); } else { el.logDock.classList.add('hasError'); }
    }
    render();
  }
  state.converting = false; updateActionBar();
  el.logDock.classList.remove('live');
}

// Progress + ETA
window.api.onProgress(({ jobId, percent }) => {
  const f = state.files.find(x => x.jobId === jobId);
  if (!f || f.status !== 'working') return;
  f.percent = percent;
  const fill = document.querySelector(`[data-fill="${f.id}"]`);
  const status = document.querySelector(`[data-status="${f.id}"]`);
  if (fill) fill.style.width = percent + '%';
  if (status) {
    let txt = percent + '%';
    if (percent > 2 && f.startedAt) {
      const elapsed = (Date.now() - f.startedAt) / 1000;
      const eta = elapsed / (percent / 100) - elapsed;
      if (isFinite(eta) && eta > 0) txt += ` · ${fmtTime(eta)}`;
    }
    status.textContent = txt;
  }
});

// Engine log
window.api.onLog(({ level, line, name }) => {
  log(level, line, name);
});
let logLineCount = 0;
function log(level, line, name) {
  const div = document.createElement('div');
  div.className = 'l-' + level;
  const stamp = new Date().toLocaleTimeString();
  const prefix = name ? `<span class="l-name">[${escapeHtml(name)}]</span> ` : '';
  div.innerHTML = `<span style="opacity:.4">${stamp}</span> ${prefix}${escapeHtml(line)}`;
  el.logBody.appendChild(div);
  while (el.logBody.childNodes.length > 500) el.logBody.removeChild(el.logBody.firstChild);
  el.logBody.scrollTop = el.logBody.scrollHeight;

  // Header indicators.
  logLineCount++;
  el.logCount.textContent = logLineCount + ' lines';
  if (state.converting) el.logDock.classList.add('live'); else el.logDock.classList.remove('live');
  if (level === 'error' && !isLogOpen()) el.logDock.classList.add('hasError');
}

// ===========================================================================
// Render
// ===========================================================================
function render() {
  const hasFiles = state.files.length > 0;
  el.dropzone.classList.toggle('compact', hasFiles);

  el.fileList.innerHTML = '';
  for (const f of state.files) {
    const li = document.createElement('li');
    li.className = `file-item ${f.status === 'working' ? 'working' : ''} ${f.status === 'done' ? 'done' : ''} ${f.status === 'error' ? 'error' : ''} ${f.id === state.selectedId ? 'selected' : ''}`;
    li.addEventListener('click', (e) => { if (!e.target.closest('button')) selectFile(f.id); });

    const canRemove = f.status !== 'working';
    li.innerHTML = `
      <div class="file-thumb">${(f.ext || '?').toUpperCase()}</div>
      <div class="file-main">
        <div class="file-name">${escapeHtml(f.name)}</div>
        <div class="file-sub">
          <span>${fmtSize(f.size)}</span>
          ${f.duration ? `<span>· ${fmtTime(f.duration)}</span>` : ''}
          <span class="file-arrow">→</span>
          <span>${state.settings.container.toUpperCase()}</span>
          ${f.status === 'error' ? `<span class="file-err" title="${escapeHtml(f.errorDetail || '')}">· ${escapeHtml(truncate(f.errorDetail || 'Error', 46))}</span>` : ''}
        </div>
        <div class="progress-track"><div class="progress-fill" data-fill="${f.id}" style="width:${f.percent}%"></div></div>
      </div>
      <div class="file-status" data-status="${f.id}">${statusLabel(f)}</div>
      ${f.status === 'done'
        ? `<button class="icon-btn reveal-btn" data-reveal="${f.id}" title="Show in folder"><svg viewBox="0 0 24 24" width="17" height="17"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>`
        : f.status === 'working'
          ? `<button class="icon-btn" data-cancel="${f.id}" title="Cancel"><svg viewBox="0 0 24 24" width="16" height="16"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg></button>`
          : canRemove
            ? `<button class="icon-btn" data-remove="${f.id}" title="Remove"><svg viewBox="0 0 24 24" width="17" height="17"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>`
            : ''}`;
    el.fileList.appendChild(li);
  }

  el.fileList.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => { state.files = state.files.filter(f => f.id != b.dataset.remove); if (state.selectedId == b.dataset.remove) { state.selectedId = null; clearPreview(); } render(); }));
  el.fileList.querySelectorAll('[data-reveal]').forEach(b => b.addEventListener('click', () => { const f = state.files.find(f => f.id == b.dataset.reveal); if (f && f.outPath) window.api.openPath(f.outPath); }));
  el.fileList.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => { const f = state.files.find(f => f.id == b.dataset.cancel); if (f && f.jobId) window.api.cancelJob(f.jobId); }));

  updateActionBar();
}

function statusLabel(f) {
  if (f.status === 'working') return f.percent + '%';
  if (f.status === 'done') return 'Done';
  if (f.status === 'error') return 'Failed';
  return 'Ready';
}

function updateActionBar() {
  const pending = state.files.filter(f => f.status === 'ready' || f.status === 'error').length;
  const done = state.files.filter(f => f.status === 'done').length;
  el.convertBtn.disabled = state.converting || pending === 0;
  el.convertBtn.textContent = state.converting ? 'Converting…' : (pending > 1 ? `Convert ${pending} files` : 'Convert');
  el.clearBtn.disabled = state.converting;
  const parts = [];
  if (pending) parts.push(`${pending} queued`);
  if (done) parts.push(`${done} done`);
  el.summary.textContent = parts.join(' · ');
}

// Estimated output size (bitrate mode) for the selected file.
function updateEstimate() {
  const f = state.files.find(x => x.id === state.selectedId);
  if (!f || !f.duration) return;
  const s = state.settings;
  const dur = MC.effectiveTrimDuration(f.duration, s.trim);
  const bytes = MC.estimateSize({
    durationSec: dur,
    qualityMode: s.qualityMode,
    containerKind: state.containers[s.container].kind,
    videoBitrate: s.videoBitrate,
    audioBitrate: s.audioBitrate,
  });
  const baseText = el.previewMeta.textContent.replace(/ · est\..*$/, '');
  el.previewMeta.textContent = bytes ? `${baseText} · est. ${fmtSize(bytes)}` : baseText;
}

boot();
