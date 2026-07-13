const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Capabilities & config
  getCapabilities: () => ipcRenderer.invoke('get-capabilities'),
  getContainers: () => ipcRenderer.invoke('get-containers'),

  // Files
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  resolvePaths: (paths) => ipcRenderer.invoke('resolve-paths', paths),
  pickSubtitle: () => ipcRenderer.invoke('pick-subtitle'),
  pickOutputDir: () => ipcRenderer.invoke('pick-output-dir'),
  openPath: (p) => ipcRenderer.invoke('open-path', p),
  probe: (filePath) => ipcRenderer.invoke('probe', filePath),
  thumbnail: (filePath, time) => ipcRenderer.invoke('thumbnail', { filePath, time }),

  // Return the absolute path for a dropped File (Electron >= 32 removes File.path).
  getPathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch (_) { return file.path || null; } },

  // Conversion
  convert: (opts) => ipcRenderer.invoke('convert', opts),
  cancelJob: (jobId) => ipcRenderer.invoke('cancel-job', jobId),

  // Theme
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (source) => ipcRenderer.invoke('set-theme', source),

  // Streams from main
  onProgress: (cb) => {
    const l = (_e, d) => cb(d);
    ipcRenderer.on('progress', l);
    return () => ipcRenderer.removeListener('progress', l);
  },
  onLog: (cb) => {
    const l = (_e, d) => cb(d);
    ipcRenderer.on('log', l);
    return () => ipcRenderer.removeListener('log', l);
  },
});
