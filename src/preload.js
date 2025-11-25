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
  
  // Cookies для авторизації
  getCookies: () => ipcRenderer.invoke('get-suno-cookies'),
  setCookies: (cookies) => ipcRenderer.invoke('set-cookies', cookies),
  
  // Слухаємо команди з трея
  onTrayTogglePlay: (callback) => {
    ipcRenderer.on('tray-toggle-play', callback);
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
