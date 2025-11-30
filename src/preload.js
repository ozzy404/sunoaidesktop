const { contextBridge, ipcRenderer } = require('electron');

// Secure API for renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Window control
  minimize: () => ipcRenderer.invoke('minimize-window'),
  maximize: () => ipcRenderer.invoke('maximize-window'),
  close: () => ipcRenderer.invoke('close-window'),
  
  // Authentication
  openAuthWindow: () => ipcRenderer.invoke('open-auth-window'),
  checkAuth: () => ipcRenderer.invoke('check-auth'),
  logout: () => ipcRenderer.invoke('logout'),
  
  // API requests via main process (avoid CORS)
  apiRequest: (options) => ipcRenderer.invoke('api-request', options),
  
  // Tray commands
  onTrayTogglePlay: (callback) => {
    ipcRenderer.on('tray-toggle-play', callback);
  },
  
  // Windows taskbar thumbnail toolbar commands
  onThumbarPrev: (callback) => {
    ipcRenderer.on('thumbar-prev', callback);
  },
  onThumbarPlayPause: (callback) => {
    ipcRenderer.on('thumbar-play-pause', callback);
  },
  onThumbarNext: (callback) => {
    ipcRenderer.on('thumbar-next', callback);
  },
  
  // Token expiry notifications
  onTokenExpiringSoon: (callback) => {
    ipcRenderer.on('token-expiring-soon', (event, secondsLeft) => callback(secondsLeft));
  },
  onTokenExpired: (callback) => {
    ipcRenderer.on('token-expired', callback);
  },
  
  // Notify main process about playback state change
  notifyPlaybackState: (isPlaying) => {
    ipcRenderer.send('playback-state-changed', isPlaying);
  }
});
