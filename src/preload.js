const { contextBridge, ipcRenderer } = require('electron');

// Безпечний API для renderer процесу
contextBridge.exposeInMainWorld('electronAPI', {
  // Контроль вікна
  minimize: () => ipcRenderer.invoke('minimize-window'),
  maximize: () => ipcRenderer.invoke('maximize-window'),
  close: () => ipcRenderer.invoke('close-window'),
  
  // Автентифікація
  openAuthWindow: () => ipcRenderer.invoke('open-auth-window'),
  checkAuth: () => ipcRenderer.invoke('check-auth'),
  logout: () => ipcRenderer.invoke('logout'),
  
  // API запити через main процес (уникаємо CORS)
  apiRequest: (options) => ipcRenderer.invoke('api-request', options),
  
  // Cookies для авторизації
  getCookies: () => ipcRenderer.invoke('get-suno-cookies'),
  setCookies: (cookies) => ipcRenderer.invoke('set-cookies', cookies),
  
  // Слухаємо команди з трея
  onTrayTogglePlay: (callback) => {
    ipcRenderer.on('tray-toggle-play', callback);
  },
  
  // Слухаємо команди з Windows taskbar thumbnail toolbar
  onThumbarPrev: (callback) => {
    ipcRenderer.on('thumbar-prev', callback);
  },
  onThumbarPlayPause: (callback) => {
    ipcRenderer.on('thumbar-play-pause', callback);
  },
  onThumbarNext: (callback) => {
    ipcRenderer.on('thumbar-next', callback);
  },
  
  // Повідомляємо main процес про зміну стану відтворення
  notifyPlaybackState: (isPlaying) => {
    ipcRenderer.send('playback-state-changed', isPlaying);
  },
  
  // Зберігання даних
  storage: {
    get: (key) => {
      return localStorage.getItem(key);
    },
    set: (key, value) => {
      localStorage.setItem(key, value);
    },
    remove: (key) => {
      localStorage.removeItem(key);
    }
  }
});
