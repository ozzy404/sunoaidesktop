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
    icon: path.join(__dirname, '../assets/icon.svg'),
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
  const iconSvgPath = path.join(__dirname, '../assets/icon.svg');
  
  // Створюємо простий трей
  try {
    // Спробуємо завантажити SVG
    const fs = require('fs');
    const svgData = fs.readFileSync(iconSvgPath, 'utf8');
    const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svgData).toString('base64')}`;
    const icon = nativeImage.createFromDataURL(svgDataUrl);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
  } catch (e) {
    console.log('Tray icon error:', e.message);
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
    
    // Очищаємо cookies перед авторизацією щоб показати вибір акаунту
    session.fromPartition('persist:suno').clearStorageData({
      storages: ['cookies']
    }).then(() => {
      authWindow = new BrowserWindow({
        width: 600,
        height: 750,
        parent: mainWindow,
        modal: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          partition: 'persist:suno', // Зберігаємо cookies
          webSecurity: true,
        },
        autoHideMenuBar: true,
        title: 'Вхід до Suno AI',
      });
      
      // Відкриваємо сторінку входу Suno через Clerk
      // Відкриваємо library сторінку - вона вимагає авторизації
      authWindow.loadURL(`${SUNO_URL}/library`);
      
      let authCompleted = false;
      let initialLoad = true;
      
      // Слухаємо зміни URL - чекаємо на успішну авторизацію
      const checkAuth = async (url) => {
        console.log('Navigation URL:', url);
        
        // Пропускаємо перше завантаження
        if (initialLoad) {
          initialLoad = false;
          console.log('Initial load, waiting for auth...');
          return;
        }
        
        // Якщо це Google OAuth callback до Clerk - користувач вибрав акаунт
        if (url.includes('clerk.suno.com/v1/oauth_callback') || url.includes('accounts.google.com/signin/oauth')) {
          console.log('OAuth in progress...');
          return;
        }
        
        // Якщо користувач успішно увійшов і перейшов на головну/create/library сторінку
        if (!authCompleted && (url.includes('suno.com/create') || url.includes('suno.com/library') || url.includes('suno.com/home') || url === 'https://suno.com/' || url === 'https://suno.com')) {
          // Невелика затримка щоб cookies встигли записатися
          await new Promise(r => setTimeout(r, 1000));
          
          // Перевіряємо чи є Clerk session cookie
          const clerkCookies = await session.fromPartition('persist:suno').cookies.get({ url: CLERK_URL });
          const sunoCookies = await session.fromPartition('persist:suno').cookies.get({ url: SUNO_URL });
          const allCheckCookies = [...clerkCookies, ...sunoCookies];
          
          const hasSession = allCheckCookies.some(c => c.name === '__session' || c.name === '__client_uat');
          
          console.log('Checking session - has session:', hasSession, 'total cookies:', allCheckCookies.length);
          
          if (hasSession) {
            authCompleted = true;
            console.log('Auth completed! Copying cookies...');
            
            // Отримуємо всі cookies
            const allCookies = await session.fromPartition('persist:suno').cookies.get({});
            console.log('Total cookies:', allCookies.length);
            
            // Копіюємо cookies в основну сесію
            for (const cookie of allCookies) {
              try {
                let cookieUrl = SUNO_URL;
                if (cookie.domain.includes('clerk')) {
                  cookieUrl = CLERK_URL;
                } else if (cookie.domain.includes('suno')) {
                  cookieUrl = `https://${cookie.domain.replace(/^\./, '')}`;
                }
                
                await session.defaultSession.cookies.set({
                  url: cookieUrl,
                  name: cookie.name,
                  value: cookie.value,
                  domain: cookie.domain,
                  path: cookie.path || '/',
                  secure: cookie.secure !== false,
                  httpOnly: cookie.httpOnly || false,
                  sameSite: cookie.sameSite || 'lax',
                  expirationDate: cookie.expirationDate,
                });
              } catch (e) {
                console.log('Cookie error:', e.message);
              }
            }
            
            setTimeout(() => {
              if (authWindow && !authWindow.isDestroyed()) {
                authWindow.close();
              }
            }, 500);
            resolve(true);
          }
        }
      };
      
      authWindow.webContents.on('did-navigate', (event, url) => checkAuth(url));
      authWindow.webContents.on('did-navigate-in-page', (event, url) => checkAuth(url));
      authWindow.webContents.on('did-redirect-navigation', (event, url) => checkAuth(url));
      
      // Відкриваємо DevTools для налагодження (можна видалити пізніше)
      // authWindow.webContents.openDevTools();
      
      authWindow.on('closed', () => {
        authWindow = null;
        if (!authCompleted) {
          resolve(false);
        }
      });
    });
  });
});

// Перевіряємо чи є активна сесія
ipcMain.handle('check-auth', async () => {
  try {
    const sunoPartition = session.fromPartition('persist:suno');
    
    // Перевіряємо cookies для Suno та Clerk
    const sunoCookies = await sunoPartition.cookies.get({ url: SUNO_URL });
    const clerkCookies = await sunoPartition.cookies.get({ url: CLERK_URL });
    
    // Шукаємо __session cookie від Clerk (це JWT токен авторизації)
    const allCookies = [...sunoCookies, ...clerkCookies];
    const sessionCookie = allCookies.find(c => c.name === '__session');
    const clientUatCookie = allCookies.find(c => c.name === '__client_uat');
    
    console.log('Check auth - session cookie:', !!sessionCookie);
    console.log('Check auth - client_uat cookie:', !!clientUatCookie);
    console.log('Check auth - total cookies:', allCookies.length);
    
    // Якщо є __session cookie - користувач авторизований
    return !!sessionCookie;
  } catch (e) {
    console.log('Check auth error:', e.message);
    return false;
  }
});

// Вихід з системи - очищаємо всі cookies
ipcMain.handle('logout', async () => {
  try {
    // Очищаємо сесію авторизації (persist:suno)
    await session.fromPartition('persist:suno').clearStorageData({
      storages: ['cookies', 'localstorage', 'sessionstorage']
    });
    // Також очищаємо основну сесію
    await session.defaultSession.clearStorageData({
      storages: ['cookies', 'localstorage', 'sessionstorage']
    });
    console.log('Logout completed');
    return true;
  } catch (e) {
    console.log('Logout error:', e.message);
    return false;
  }
});

// API запити через main процес (для уникнення CORS)
ipcMain.handle('api-request', async (event, { url, method = 'GET', body = null }) => {
  
  return new Promise(async (resolve, reject) => {
    try {
      // Отримуємо cookies для API запиту з persist:suno partition
      const sunoPartition = session.fromPartition('persist:suno');
      const sunoCookies = await sunoPartition.cookies.get({ url: SUNO_URL });
      const apiCookies = await sunoPartition.cookies.get({ url: SUNO_API_URL });
      const clerkCookies = await sunoPartition.cookies.get({ url: CLERK_URL });
      
      // Формуємо cookie string
      const allCookies = [...sunoCookies, ...apiCookies, ...clerkCookies];
      const uniqueCookies = allCookies.filter((cookie, index, self) => 
        index === self.findIndex(c => c.name === cookie.name)
      );
      const cookieString = uniqueCookies.map(c => `${c.name}=${c.value}`).join('; ');
      
      // Знаходимо Clerk session token
      const sessionCookie = uniqueCookies.find(c => c.name === '__session');
      
      // Генеруємо browser-token як в оригінальному сайті
      const browserToken = JSON.stringify({ timestamp: Date.now() });
      const encodedToken = Buffer.from(browserToken).toString('base64');
      
      // Генеруємо device-id 
      const deviceId = require('crypto').randomUUID();
      
      console.log('API Request:', url);
      console.log('Has session cookie:', !!sessionCookie);
      console.log('Cookie count:', uniqueCookies.length);
      
      // Використовуємо node-fetch замість net.request для кращої сумісності з cookies
      const https = require('https');
      const urlObj = new URL(url);
      
      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: method,
        headers: {
          'Accept': '*/*',
          'Content-Type': 'application/json',
          'Origin': SUNO_URL,
          'Referer': `${SUNO_URL}/`,
          'browser-token': `{"token":"${encodedToken}"}`,
          'device-id': deviceId,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Cookie': cookieString,
        }
      };
      
      if (body) {
        options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
      }
      
      const req = https.request(options, (res) => {
        let responseData = '';
        
        console.log('API Response status:', res.statusCode);
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const json = JSON.parse(responseData);
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data: json, status: res.statusCode });
          } catch (e) {
            console.log('Response parse error:', responseData.substring(0, 200));
            resolve({ ok: false, error: 'Invalid JSON response', raw: responseData.substring(0, 500), status: res.statusCode });
          }
        });
      });
      
      req.on('error', (error) => {
        console.log('API Request error:', error.message);
        resolve({ ok: false, error: error.message });
      });
      
      if (body) {
        req.write(JSON.stringify(body));
      }
      
      req.end();
    } catch (error) {
      console.log('API Handler error:', error.message);
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
