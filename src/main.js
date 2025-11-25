const { app, BrowserWindow, ipcMain, session, Menu, Tray, nativeImage } = require('electron');
const path = require('path');

// Оптимізації для мінімального споживання ресурсів
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128'); // Обмежуємо RAM

let mainWindow;
let tray = null;

// Зберігаємо cookies для авторизації
const SUNO_URL = 'https://suno.com';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 700,
    minWidth: 350,
    minHeight: 500,
    frame: false,
    transparent: false,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      // Оптимізації
      backgroundThrottling: true, // Економить ресурси коли не в фокусі
      enableBlinkFeatures: '',
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    backgroundColor: '#1a1a2e',
    show: false, // Показуємо після завантаження
  });

  // Показуємо вікно коли готове (швидший запуск)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  // Мінімізація в трей замість закриття
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  // Створюємо системний трей
  createTray();
}

function createTray() {
  const iconPath = path.join(__dirname, '../assets/icon.png');
  
  // Створюємо простий трей (іконка може бути відсутня)
  try {
    tray = new Tray(iconPath);
  } catch (e) {
    // Якщо іконки немає, створюємо порожню
    const icon = nativeImage.createEmpty();
    tray = new Tray(icon);
  }

  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Відкрити', 
      click: () => mainWindow.show() 
    },
    { 
      label: 'Play/Pause', 
      click: () => mainWindow.webContents.send('tray-toggle-play') 
    },
    { type: 'separator' },
    { 
      label: 'Вихід', 
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Suno Desktop Player');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

// IPC handlers для комунікації з renderer
ipcMain.handle('minimize-window', () => {
  mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('close-window', () => {
  mainWindow.hide();
});

// Отримання cookies після авторизації
ipcMain.handle('get-suno-cookies', async () => {
  const cookies = await session.defaultSession.cookies.get({ url: SUNO_URL });
  return cookies;
});

// Встановлення cookies
ipcMain.handle('set-cookies', async (event, cookies) => {
  for (const cookie of cookies) {
    await session.defaultSession.cookies.set({
      url: SUNO_URL,
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || '/',
      secure: cookie.secure || true,
      httpOnly: cookie.httpOnly || false,
    });
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

// Очищуємо при виході
app.on('before-quit', () => {
  app.isQuitting = true;
});
