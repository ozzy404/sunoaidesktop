const { app, BrowserWindow, ipcMain, session, Menu, Tray, nativeImage } = require('electron');
const path = require('path');

// Оптимізації для мінімального споживання ресурсів
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128'); // Обмежуємо RAM

let mainWindow;
let authWindow = null;
let tray = null;

// Зберігаємо cookies для авторизації
const SUNO_URL = 'https://suno.com';
const SUNO_API_URL = 'https://studio-api.prod.suno.com';
const CLERK_URL = 'https://clerk.suno.com';

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

// Відкриваємо вікно авторизації через Google/Clerk
ipcMain.handle('open-auth-window', async () => {
  return new Promise((resolve, reject) => {
    if (authWindow) {
      authWindow.focus();
      return resolve(false);
    }
    
    authWindow = new BrowserWindow({
      width: 500,
      height: 700,
      parent: mainWindow,
      modal: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'persist:suno', // Зберігаємо cookies
      },
      autoHideMenuBar: true,
      title: 'Вхід до Suno AI',
    });
    
    // Завантажуємо Suno, щоб почати авторизацію
    authWindow.loadURL(SUNO_URL);
    
    // Слухаємо успішний вхід (коли URL змінюється на головну сторінку Suno)
    authWindow.webContents.on('did-navigate', async (event, url) => {
      // Якщо користувач успішно увійшов і перейшов на create або home
      if (url.includes('suno.com/create') || url.includes('suno.com/home') || url === 'https://suno.com/' || url === 'https://suno.com') {
        // Отримуємо всі cookies
        const allCookies = await session.fromPartition('persist:suno').cookies.get({});
        
        // Копіюємо cookies в основну сесію
        for (const cookie of allCookies) {
          try {
            await session.defaultSession.cookies.set({
              url: cookie.domain.includes('suno') ? `https://${cookie.domain.replace(/^\./, '')}` : `https://suno.com`,
              name: cookie.name,
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path || '/',
              secure: cookie.secure !== false,
              httpOnly: cookie.httpOnly || false,
              sameSite: cookie.sameSite || 'lax',
            });
          } catch (e) {
            console.log('Cookie error:', e.message);
          }
        }
        
        authWindow.close();
        resolve(true);
      }
    });
    
    authWindow.on('closed', () => {
      authWindow = null;
      resolve(false);
    });
  });
});

// Перевіряємо чи є активна сесія
ipcMain.handle('check-auth', async () => {
  try {
    const cookies = await session.defaultSession.cookies.get({ url: SUNO_URL });
    const clerkCookies = await session.defaultSession.cookies.get({ url: CLERK_URL });
    
    // Шукаємо Clerk session cookie
    const hasClerkSession = clerkCookies.some(c => c.name.includes('__clerk') || c.name.includes('__session'));
    const hasSunoCookies = cookies.length > 0;
    
    return hasClerkSession || hasSunoCookies;
  } catch (e) {
    return false;
  }
});

// Вихід з системи - очищаємо всі cookies
ipcMain.handle('logout', async () => {
  await session.defaultSession.clearStorageData({
    storages: ['cookies', 'localstorage', 'sessionstorage']
  });
  // Очищаємо також сесію авторизації
  await session.fromPartition('persist:suno').clearStorageData({
    storages: ['cookies', 'localstorage', 'sessionstorage']
  });
  return true;
});

// API запити через main процес (для уникнення CORS)
ipcMain.handle('api-request', async (event, { url, method = 'GET', body = null }) => {
  const { net } = require('electron');
  
  return new Promise(async (resolve, reject) => {
    try {
      // Отримуємо cookies для API запиту
      const sunoCookies = await session.fromPartition('persist:suno').cookies.get({ url: SUNO_URL });
      const apiCookies = await session.fromPartition('persist:suno').cookies.get({ url: SUNO_API_URL });
      const clerkCookies = await session.fromPartition('persist:suno').cookies.get({ url: CLERK_URL });
      
      // Формуємо cookie string
      const allCookies = [...sunoCookies, ...apiCookies, ...clerkCookies];
      const cookieString = allCookies.map(c => `${c.name}=${c.value}`).join('; ');
      
      // Генеруємо browser-token
      const browserToken = JSON.stringify({ timestamp: Date.now() });
      const encodedToken = Buffer.from(browserToken).toString('base64');
      
      const request = net.request({
        method,
        url,
        partition: 'persist:suno',
      });
      
      request.setHeader('Accept', 'application/json');
      request.setHeader('Content-Type', 'application/json');
      request.setHeader('Origin', SUNO_URL);
      request.setHeader('Referer', `${SUNO_URL}/`);
      request.setHeader('browser-token', `{"token":"${encodedToken}"}`);
      
      if (cookieString) {
        request.setHeader('Cookie', cookieString);
      }
      
      let responseData = '';
      
      request.on('response', (response) => {
        response.on('data', (chunk) => {
          responseData += chunk.toString();
        });
        
        response.on('end', () => {
          try {
            const json = JSON.parse(responseData);
            resolve({ ok: true, data: json });
          } catch (e) {
            resolve({ ok: false, error: 'Invalid JSON response' });
          }
        });
      });
      
      request.on('error', (error) => {
        resolve({ ok: false, error: error.message });
      });
      
      if (body) {
        request.write(JSON.stringify(body));
      }
      
      request.end();
    } catch (error) {
      resolve({ ok: false, error: error.message });
    }
  });
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
