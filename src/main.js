const { app, BrowserWindow, ipcMain, session, Menu, Tray, nativeImage, shell } = require('electron');
const path = require('path');
const https = require('https');

// Performance optimizations
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');

let mainWindow;
let tray = null;
let authWindow = null;

// JWT token cache
let cachedJwtToken = null;
let jwtTokenExpiry = 0;

// URLs
const SUNO_URL = 'https://suno.com';
const SUNO_API_URL = 'https://studio-api.prod.suno.com';

// i18n for main process
const translations = {
  en: {
    open: 'Open',
    playPause: 'Play/Pause',
    exit: 'Exit',
    previous: 'Previous',
    pause: 'Pause',
    play: 'Play',
    next: 'Next',
    authTitle: 'Authorization - paste JWT token',
    authHeader: '🔐 Suno AI Authorization',
    howToGetToken: 'How to get the token:',
    method1: 'Method 1 (simple):',
    method1Steps: ['Log in to suno.com in your browser', 'Press F12 → Console tab', 'Paste this code and press Enter:'],
    method1Note: 'Token will be copied automatically!',
    method2: 'Method 2 (via Network):',
    method2Steps: ['F12 → Network → refresh the page', 'Find any request to studio-api', 'Copy authorization header (after "Bearer ")'],
    placeholder: 'Paste JWT token here (starts with eyJ...)',
    tokenNote: '⚠️ Token is valid for ~1 hour.',
    cancel: 'Cancel',
    authorize: 'Authorize',
    error: 'Error: paste a valid JWT token'
  },
  uk: {
    open: 'Відкрити',
    playPause: 'Грати/Пауза',
    exit: 'Вихід',
    previous: 'Попередній',
    pause: 'Пауза',
    play: 'Грати',
    next: 'Наступний',
    authTitle: 'Авторизація - вставте JWT токен',
    authHeader: '🔐 Авторизація Suno AI',
    howToGetToken: 'Як отримати токен:',
    method1: 'Спосіб 1 (простий):',
    method1Steps: ['Увійдіть на suno.com у браузері', 'Натисніть F12 → вкладка Console', 'Вставте цей код і натисніть Enter:'],
    method1Note: 'Токен скопіюється автоматично!',
    method2: 'Спосіб 2 (через Network):',
    method2Steps: ['F12 → Network → оновіть сторінку', 'Знайдіть будь-який запит до studio-api', 'Скопіюйте authorization header (після "Bearer ")'],
    placeholder: 'Вставте JWT токен сюди (починається з eyJ...)',
    tokenNote: '⚠️ Токен дійсний ~1 годину.',
    cancel: 'Скасувати',
    authorize: 'Авторизуватися',
    error: 'Помилка: вставте правильний JWT токен'
  },
  ru: {
    open: 'Открыть',
    playPause: 'Играть/Пауза',
    exit: 'Выход',
    previous: 'Предыдущий',
    pause: 'Пауза',
    play: 'Играть',
    next: 'Следующий',
    authTitle: 'Авторизация - вставьте JWT токен',
    authHeader: '🔐 Авторизация Suno AI',
    howToGetToken: 'Как получить токен:',
    method1: 'Способ 1 (простой):',
    method1Steps: ['Войдите на suno.com в браузере', 'Нажмите F12 → вкладка Console', 'Вставьте этот код и нажмите Enter:'],
    method1Note: 'Токен скопируется автоматически!',
    method2: 'Способ 2 (через Network):',
    method2Steps: ['F12 → Network → обновите страницу', 'Найдите любой запрос к studio-api', 'Скопируйте authorization header (после "Bearer ")'],
    placeholder: 'Вставьте JWT токен сюда (начинается с eyJ...)',
    tokenNote: '⚠️ Токен действителен ~1 час.',
    cancel: 'Отмена',
    authorize: 'Авторизоваться',
    error: 'Ошибка: вставьте правильный JWT токен'
  }
};

function getSystemLang() {
  const locale = app.getLocale().split('-')[0];
  if (locale === 'uk') return 'uk';
  if (locale === 'ru') return 'ru';
  return 'en';
}

function t(key) {
  const lang = getSystemLang();
  return translations[lang]?.[key] || translations.en[key] || key;
}

function createWindow() {
  // Create app icon (32x32)
  const createAppIcon = () => {
    const size = 32;
    const pixels = Buffer.alloc(size * size * 4, 0);
    
    const setPixel = (x, y, r, g, b, a) => {
      if (x >= 0 && x < size && y >= 0 && y < size) {
        const idx = (y * size + x) * 4;
        pixels[idx] = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
        pixels[idx + 3] = a;
      }
    };
    
    // Circle background (purple gradient)
    const cx = 16, cy = 16, r = 14;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx, dy = y - cy;
        if (Math.sqrt(dx * dx + dy * dy) <= r) {
          const t = (x + y) / (size * 2);
          setPixel(x, y, Math.floor(124 + t * 44), Math.floor(58 + t * 27), Math.floor(237 + t * 10), 255);
        }
      }
    }
    
    // Sound wave bars (pink)
    [[8, 11, 21], [12, 9, 23], [16, 7, 25], [20, 9, 23], [24, 11, 21]].forEach(([bx, y1, y2]) => {
      for (let y = y1; y <= y2; y++) {
        setPixel(bx, y, 236, 72, 153, 255);
        setPixel(bx - 1, y, 236, 72, 153, 255);
      }
    });
    
    try {
      return nativeImage.createFromBuffer(pixels, { width: size, height: size });
    } catch (e) {
      return nativeImage.createEmpty();
    }
  };
  
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
      backgroundThrottling: true,
    },
    icon: createAppIcon(),
    backgroundColor: '#1a1a2e',
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    setTimeout(() => setupThumbarButtons(false), 500);
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  createTray();
}

function createTray() {
  // Create tray icon (16x16)
  const createTrayIcon = () => {
    const size = 16;
    const pixels = Buffer.alloc(size * size * 4, 0);
    
    const setPixel = (x, y, r, g, b, a) => {
      if (x >= 0 && x < size && y >= 0 && y < size) {
        const idx = (y * size + x) * 4;
        pixels[idx] = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
        pixels[idx + 3] = a;
      }
    };
    
    // Circle background
    const cx = 8, cy = 8, r = 7;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) <= r) {
          setPixel(x, y, 124, 58, 237, 255);
        }
      }
    }
    
    // Sound wave bars
    [[4, 5, 10], [6, 4, 11], [8, 3, 12], [10, 4, 11], [12, 5, 10]].forEach(([bx, y1, y2]) => {
      for (let y = y1; y <= y2; y++) setPixel(bx, y, 236, 72, 153, 255);
    });
    
    try {
      return nativeImage.createFromBuffer(pixels, { width: size, height: size });
    } catch (e) {
      return nativeImage.createEmpty();
    }
  };
  
  try {
    tray = new Tray(createTrayIcon());
  } catch (e) {
    tray = new Tray(nativeImage.createEmpty());
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: t('open'), click: () => mainWindow.show() },
    { label: t('playPause'), click: () => mainWindow.webContents.send('tray-toggle-play') },
    { type: 'separator' },
    { label: t('exit'), click: () => { app.isQuitting = true; app.quit(); } }
  ]);

  tray.setToolTip('Suno Desktop Player');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show());
}

// IPC handlers
ipcMain.handle('minimize-window', () => mainWindow.minimize());
ipcMain.handle('maximize-window', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.handle('close-window', () => mainWindow.hide());

ipcMain.on('playback-state-changed', (event, isPlaying) => {
  setupThumbarButtons(isPlaying);
});

// Windows Taskbar Thumbnail Toolbar
function setupThumbarButtons(isPlaying) {
  if (process.platform !== 'win32' || !mainWindow) return;
  
  const createPixelIcon = (type) => {
    const size = 16;
    const pixels = Buffer.alloc(size * size * 4, 0);
    
    const setPixel = (x, y, r, g, b, a) => {
      if (x >= 0 && x < size && y >= 0 && y < size) {
        const idx = (y * size + x) * 4;
        pixels[idx] = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
        pixels[idx + 3] = a;
      }
    };
    
    const fillRect = (x1, y1, x2, y2) => {
      for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) {
          setPixel(x, y, 255, 255, 255, 255);
        }
      }
    };
    
    if (type === 'prev') {
      fillRect(3, 3, 5, 12);
      for (let i = 0; i < 6; i++) {
        fillRect(12 - i, 5 + i, 12, 5 + i);
        fillRect(12 - i, 10 - i, 12, 10 - i);
      }
    } else if (type === 'play') {
      for (let i = 0; i < 7; i++) {
        fillRect(4 + i, 3 + i, 4 + i, 12 - i);
      }
    } else if (type === 'pause') {
      fillRect(4, 3, 6, 12);
      fillRect(9, 3, 11, 12);
    } else if (type === 'next') {
      for (let i = 0; i < 6; i++) {
        fillRect(3, 5 + i, 3 + i, 5 + i);
        fillRect(3, 10 - i, 3 + i, 10 - i);
      }
      fillRect(10, 3, 12, 12);
    }
    
    try {
      return nativeImage.createFromBuffer(pixels, { width: size, height: size });
    } catch (e) {
      return nativeImage.createEmpty();
    }
  };
  
  try {
    mainWindow.setThumbarButtons([
      {
        tooltip: t('previous'),
        icon: createPixelIcon('prev'),
        click: () => mainWindow.webContents.send('thumbar-prev')
      },
      {
        tooltip: isPlaying ? t('pause') : t('play'),
        icon: createPixelIcon(isPlaying ? 'pause' : 'play'),
        click: () => mainWindow.webContents.send('thumbar-play-pause')
      },
      {
        tooltip: t('next'),
        icon: createPixelIcon('next'),
        click: () => mainWindow.webContents.send('thumbar-next')
      }
    ]);
  } catch (e) {
    console.log('Error setting thumbar buttons:', e.message);
  }
}

// Authorization via system browser
ipcMain.handle('open-auth-window', async () => {
  return new Promise((resolve) => {
    console.log('Opening system browser for Suno login...');
    shell.openExternal(SUNO_URL);
    showCookieInputWindow(resolve);
  });
});

function showCookieInputWindow(resolve) {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.close();
    authWindow = null;
  }
  
  ipcMain.removeAllListeners('jwt-submitted');
  ipcMain.removeAllListeners('cookie-cancelled');
  
  authWindow = new BrowserWindow({
    width: 550,
    height: 580,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true,
    title: t('authTitle'),
    resizable: false,
    show: false,
  });
  
  authWindow.once('ready-to-show', () => authWindow.show());
  
  const lang = getSystemLang();
  const tr = translations[lang] || translations.en;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Suno Authorization</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          color: white;
          padding: 20px;
          height: 100vh;
          overflow-y: auto;
        }
        h2 { margin-bottom: 15px; color: #a78bfa; }
        .instructions { 
          background: rgba(255,255,255,0.1); 
          padding: 15px; 
          border-radius: 8px; 
          margin-bottom: 15px;
          font-size: 12px;
          line-height: 1.6;
        }
        .instructions ol { margin-left: 20px; }
        .instructions li { margin: 8px 0; }
        .instructions code { 
          background: rgba(0,0,0,0.3); 
          padding: 2px 6px; 
          border-radius: 4px;
          font-family: monospace;
          color: #a78bfa;
        }
        .method { 
          background: rgba(124, 58, 237, 0.2); 
          padding: 10px; 
          border-radius: 6px; 
          margin: 10px 0;
          border-left: 3px solid #7c3aed;
        }
        .method-title { font-weight: bold; color: #a78bfa; margin-bottom: 5px; }
        textarea { 
          width: 100%; 
          height: 80px; 
          padding: 10px;
          border: 2px solid #7c3aed;
          border-radius: 8px;
          background: rgba(255,255,255,0.1);
          color: white;
          font-family: monospace;
          font-size: 11px;
          resize: none;
          margin-bottom: 10px;
        }
        textarea:focus { outline: none; border-color: #a78bfa; }
        textarea::placeholder { color: rgba(255,255,255,0.5); }
        .buttons { display: flex; gap: 10px; }
        button {
          flex: 1;
          padding: 12px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-primary { background: #7c3aed; color: white; }
        .btn-primary:hover { background: #6d28d9; }
        .btn-secondary { background: rgba(255,255,255,0.1); color: white; }
        .btn-secondary:hover { background: rgba(255,255,255,0.2); }
        .error { color: #f87171; font-size: 12px; margin-top: 10px; display: none; }
        .note { color: #fbbf24; font-size: 11px; margin-top: 5px; }
      </style>
    </head>
    <body>
      <h2>${tr.authHeader}</h2>
      
      <div class="instructions">
        <p><strong>${tr.howToGetToken}</strong></p>
        
        <div class="method">
          <div class="method-title">${tr.method1}</div>
          <ol>
            <li>${tr.method1Steps[0]}</li>
            <li>${tr.method1Steps[1]}</li>
            <li>${tr.method1Steps[2]}</li>
          </ol>
          <code style="display:block; margin-top:8px; font-size:10px; word-break:break-all;">
            copy(JSON.parse(localStorage.getItem('clerk-db-jwt'))?.tokensByInstance?.ins_2OZ6yMDg8lqdJEih1rozf8Ozmdn?.jwt || 'Token not found')
          </code>
          <li style="list-style:none; margin-top:5px;">${tr.method1Note}</li>
        </div>
        
        <div class="method">
          <div class="method-title">${tr.method2}</div>
          <ol>
            <li>${tr.method2Steps[0]}</li>
            <li>${tr.method2Steps[1]}</li>
            <li>${tr.method2Steps[2]}</li>
          </ol>
        </div>
      </div>
      
      <textarea id="cookie-input" placeholder="${tr.placeholder}"></textarea>
      <p class="note">${tr.tokenNote}</p>
      
      <div class="buttons">
        <button class="btn-secondary" onclick="cancel()">${tr.cancel}</button>
        <button class="btn-primary" onclick="submit()">${tr.authorize}</button>
      </div>
      
      <p class="error" id="error">${tr.error}</p>
      
      <script>
        const { ipcRenderer } = require('electron');
        
        function submit() {
          let value = document.getElementById('cookie-input').value.trim();
          if (value.toLowerCase().startsWith('bearer ')) {
            value = value.substring(7);
          }
          if (!value || !value.startsWith('eyJ') || value.length < 100) {
            document.getElementById('error').style.display = 'block';
            return;
          }
          ipcRenderer.send('jwt-submitted', value);
        }
        
        function cancel() {
          ipcRenderer.send('cookie-cancelled');
        }
        
        document.getElementById('cookie-input').addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && e.ctrlKey) submit();
        });
      </script>
    </body>
    </html>
  `;
  
  authWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  
  ipcMain.once('jwt-submitted', async (event, jwtToken) => {
    console.log('JWT submitted, length:', jwtToken.length);
    
    try {
      cachedJwtToken = jwtToken;
      
      try {
        const payload = JSON.parse(Buffer.from(jwtToken.split('.')[1], 'base64').toString());
        jwtTokenExpiry = payload.exp * 1000;
        console.log('JWT token expires:', new Date(jwtTokenExpiry));
      } catch (e) {
        jwtTokenExpiry = Date.now() + 3600000;
      }
      
      const sunoSession = session.fromPartition('persist:suno');
      await sunoSession.cookies.set({
        url: SUNO_URL,
        name: '__jwt_token',
        value: jwtToken,
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'no_restriction',
        expirationDate: Math.floor(jwtTokenExpiry / 1000),
      });
      
      console.log('JWT token saved successfully');
      
      if (authWindow && !authWindow.isDestroyed()) {
        authWindow.close();
      }
      resolve(true);
    } catch (e) {
      console.log('Error saving JWT:', e.message);
      resolve(false);
    }
  });
  
  ipcMain.once('cookie-cancelled', () => {
    if (authWindow && !authWindow.isDestroyed()) {
      authWindow.close();
    }
    resolve(false);
  });
  
  authWindow.on('closed', () => {
    authWindow = null;
    ipcMain.removeAllListeners('jwt-submitted');
    ipcMain.removeAllListeners('cookie-cancelled');
  });
}

// Check authentication
ipcMain.handle('check-auth', async () => {
  try {
    if (cachedJwtToken && Date.now() < jwtTokenExpiry - 60000) {
      return true;
    }
    
    const sunoSession = session.fromPartition('persist:suno');
    const cookies = await sunoSession.cookies.get({ url: SUNO_URL });
    const jwtCookie = cookies.find(c => c.name === '__jwt_token');
    
    if (jwtCookie?.value) {
      try {
        const payload = JSON.parse(Buffer.from(jwtCookie.value.split('.')[1], 'base64').toString());
        if (payload.exp * 1000 > Date.now()) {
          cachedJwtToken = jwtCookie.value;
          jwtTokenExpiry = payload.exp * 1000;
          return true;
        }
      } catch (e) {}
    }
    
    return false;
  } catch (e) {
    return false;
  }
});

// Logout
ipcMain.handle('logout', async () => {
  try {
    await session.fromPartition('persist:suno').clearStorageData({
      storages: ['cookies', 'localstorage', 'sessionstorage']
    });
    cachedJwtToken = null;
    jwtTokenExpiry = 0;
    return true;
  } catch (e) {
    return false;
  }
});

// Get JWT token
async function getJwtToken() {
  if (cachedJwtToken && Date.now() < jwtTokenExpiry - 60000) {
    return cachedJwtToken;
  }
  
  try {
    const sunoSession = session.fromPartition('persist:suno');
    const cookies = await sunoSession.cookies.get({ url: SUNO_URL });
    const jwtCookie = cookies.find(c => c.name === '__jwt_token');
    
    if (jwtCookie?.value) {
      const payload = JSON.parse(Buffer.from(jwtCookie.value.split('.')[1], 'base64').toString());
      if (payload.exp * 1000 > Date.now()) {
        cachedJwtToken = jwtCookie.value;
        jwtTokenExpiry = payload.exp * 1000;
        return cachedJwtToken;
      }
    }
  } catch (e) {}
  
  return null;
}

// API Requests
ipcMain.handle('api-request', async (event, { url, method = 'GET', body = null }) => {
  return new Promise(async (resolve) => {
    try {
      const jwtToken = await getJwtToken();
      
      if (!jwtToken) {
        resolve({ ok: false, error: 'Not authenticated - please login again', status: 401 });
        return;
      }
      
      const browserToken = JSON.stringify({ token: Buffer.from(JSON.stringify({ timestamp: Date.now() })).toString('base64') });
      const urlObj = new URL(url);
      
      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: method,
        headers: {
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en-US,en;q=0.9',
          'Authorization': `Bearer ${jwtToken}`,
          'Cache-Control': 'no-cache',
          'Origin': 'https://suno.com',
          'Referer': 'https://suno.com/',
          'browser-token': browserToken,
          'device-id': 'd6d9cb68-255f-4da8-a39d-76d36b1454af',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
        }
      };
      
      if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
      }
      
      const req = https.request(options, (res) => {
        let chunks = [];
        
        res.on('data', chunk => chunks.push(chunk));
        
        res.on('end', () => {
          let responseData = Buffer.concat(chunks);
          
          const encoding = res.headers['content-encoding'];
          if (encoding) {
            try {
              const zlib = require('zlib');
              if (encoding === 'gzip') {
                responseData = zlib.gunzipSync(responseData);
              } else if (encoding === 'br') {
                responseData = zlib.brotliDecompressSync(responseData);
              } else if (encoding === 'deflate') {
                responseData = zlib.inflateSync(responseData);
              }
            } catch (e) {}
          }
          
          try {
            const json = JSON.parse(responseData.toString('utf8'));
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data: json, status: res.statusCode });
          } catch (e) {
            resolve({ ok: false, error: 'Invalid JSON', status: res.statusCode });
          }
        });
      });
      
      req.on('error', error => {
        resolve({ ok: false, error: error.message });
      });
      
      if (body) req.write(JSON.stringify(body));
      req.end();
      
    } catch (error) {
      resolve({ ok: false, error: error.message });
    }
  });
});

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else mainWindow.show();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
