const { app, BrowserWindow, ipcMain, session, Menu, Tray, nativeImage, shell } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');

// Оптимізації для мінімального споживання ресурсів
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');

let mainWindow;
let tray = null;
let authWindow = null;

// Зберігаємо JWT токен (кеш)
let cachedJwtToken = null;
let jwtTokenExpiry = 0;

// URLs
const SUNO_URL = 'https://suno.com';
const SUNO_API_URL = 'https://studio-api.prod.suno.com';

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
      backgroundThrottling: true,
      enableBlinkFeatures: '',
    },
    icon: path.join(__dirname, '../assets/icon.svg'),
    backgroundColor: '#1a1a2e',
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Initialize thumbar buttons after window is ready
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
  const iconSvgPath = path.join(__dirname, '../assets/icon.svg');
  
  try {
    const fs = require('fs');
    const svgData = fs.readFileSync(iconSvgPath, 'utf8');
    const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svgData).toString('base64')}`;
    const icon = nativeImage.createFromDataURL(svgDataUrl);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
  } catch (e) {
    console.log('Tray icon error:', e.message);
    const icon = nativeImage.createEmpty();
    tray = new Tray(icon);
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Відкрити', click: () => mainWindow.show() },
    { label: 'Play/Pause', click: () => mainWindow.webContents.send('tray-toggle-play') },
    { type: 'separator' },
    { label: 'Вихід', click: () => { app.isQuitting = true; app.quit(); } }
  ]);

  tray.setToolTip('Suno Desktop Player');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show());
}

// IPC handlers
ipcMain.handle('minimize-window', () => mainWindow.minimize());
ipcMain.handle('maximize-window', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.handle('close-window', () => mainWindow.hide());

// Update thumbnail toolbar when playback state changes
ipcMain.on('playback-state-changed', (event, isPlaying) => {
  setupThumbarButtons(isPlaying);
});

// ============ WINDOWS TASKBAR THUMBNAIL TOOLBAR ============
function setupThumbarButtons(isPlaying) {
  if (process.platform !== 'win32' || !mainWindow) return;
  
  // Create simple icons programmatically (16x16 PNG format required for Windows)
  const createIcon = (type) => {
    // Create a 16x16 icon with simple shapes
    const size = 16;
    const canvas = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <rect width="${size}" height="${size}" fill="transparent"/>
        ${type === 'prev' ? '<path d="M4 3h2v10H4zm2 5l6 5V3z" fill="white"/>' : ''}
        ${type === 'play' ? '<path d="M5 3v10l8-5z" fill="white"/>' : ''}
        ${type === 'pause' ? '<path d="M4 3h3v10H4zm5 0h3v10H9z" fill="white"/>' : ''}
        ${type === 'next' ? '<path d="M4 3v10l6-5zm6 0h2v10h-2z" fill="white"/>' : ''}
      </svg>
    `;
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(canvas).toString('base64')}`;
    try {
      return nativeImage.createFromDataURL(dataUrl).resize({ width: 16, height: 16 });
    } catch (e) {
      console.log('Icon creation error:', e.message);
      return nativeImage.createEmpty();
    }
  };
  
  const prevIcon = createIcon('prev');
  const playIcon = createIcon('play');
  const pauseIcon = createIcon('pause');
  const nextIcon = createIcon('next');
  
  try {
    mainWindow.setThumbarButtons([
      {
        tooltip: 'Попередній',
        icon: prevIcon,
        click: () => mainWindow.webContents.send('thumbar-prev')
      },
      {
        tooltip: isPlaying ? 'Пауза' : 'Грати',
        icon: isPlaying ? pauseIcon : playIcon,
        click: () => mainWindow.webContents.send('thumbar-play-pause')
      },
      {
        tooltip: 'Наступний',
        icon: nextIcon,
        click: () => mainWindow.webContents.send('thumbar-next')
      }
    ]);
    console.log('Thumbar buttons set successfully, isPlaying:', isPlaying);
  } catch (e) {
    console.log('Error setting thumbar buttons:', e.message);
  }
}

// ============ АВТОРИЗАЦІЯ ЧЕРЕЗ СИСТЕМНИЙ БРАУЗЕР ============

ipcMain.handle('open-auth-window', async () => {
  return new Promise((resolve) => {
    // Відкриваємо Suno у системному браузері
    console.log('Opening system browser for Suno login...');
    shell.openExternal(SUNO_URL);
    
    // Показуємо вікно для вставки cookies
    showCookieInputWindow(resolve);
  });
});

function showCookieInputWindow(resolve) {
  // Закриваємо попереднє вікно якщо є
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.close();
    authWindow = null;
  }
  
  // Видаляємо старі слухачі
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
    title: 'Авторизація - вставте JWT токен',
    resizable: false,
    show: false,
  });
  
  authWindow.once('ready-to-show', () => {
    authWindow.show();
  });
  
  // HTML сторінка для вводу cookie
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Авторизація Suno</title>
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
      <h2>🔐 Авторизація Suno AI</h2>
      
      <div class="instructions">
        <p><strong>Як отримати токен:</strong></p>
        
        <div class="method">
          <div class="method-title">Спосіб 1 (простий):</div>
          <ol>
            <li>Увійдіть на suno.com у браузері</li>
            <li>Натисніть <code>F12</code> → вкладка <code>Console</code></li>
            <li>Вставте цей код і натисніть Enter:</li>
          </ol>
          <code style="display:block; margin-top:8px; font-size:10px; word-break:break-all;">
            copy(JSON.parse(localStorage.getItem('clerk-db-jwt'))?.tokensByInstance?.ins_2OZ6yMDg8lqdJEih1rozf8Ozmdn?.jwt || 'Токен не знайдено')
          </code>
          <li style="list-style:none; margin-top:5px;">Токен скопіюється автоматично!</li>
        </div>
        
        <div class="method">
          <div class="method-title">Спосіб 2 (через Network):</div>
          <ol>
            <li><code>F12</code> → <code>Network</code> → оновіть сторінку</li>
            <li>Знайдіть будь-який запит до <code>studio-api</code></li>
            <li>Скопіюйте <code>authorization</code> header (після "Bearer ")</li>
          </ol>
        </div>
      </div>
      
      <textarea id="cookie-input" placeholder="Вставте JWT токен сюди (починається з eyJ...)"></textarea>
      <p class="note">⚠️ Токен дійсний ~1 годину.</p>
      
      <div class="buttons">
        <button class="btn-secondary" onclick="cancel()">Скасувати</button>
        <button class="btn-primary" onclick="submit()">Авторизуватися</button>
      </div>
      
      <p class="error" id="error">Помилка: вставте правильний JWT токен</p>
      
      <script>
        const { ipcRenderer } = require('electron');
        
        function submit() {
          let value = document.getElementById('cookie-input').value.trim();
          // Видаляємо "Bearer " якщо користувач скопіював з ним
          if (value.toLowerCase().startsWith('bearer ')) {
            value = value.substring(7);
          }
          // Перевіряємо що це JWT токен (починається з eyJ)
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
  
  // Обробка відповіді - JWT токен напряму
  ipcMain.once('jwt-submitted', async (event, jwtToken) => {
    console.log('JWT submitted, length:', jwtToken.length);
    
    try {
      // Зберігаємо JWT токен в кеш
      cachedJwtToken = jwtToken;
      
      // Парсимо токен для отримання expiry
      try {
        const payload = JSON.parse(Buffer.from(jwtToken.split('.')[1], 'base64').toString());
        jwtTokenExpiry = payload.exp * 1000; // конвертуємо в мілісекунди
        console.log('JWT token expires:', new Date(jwtTokenExpiry));
      } catch (e) {
        jwtTokenExpiry = Date.now() + 3600000; // 1 година за замовчуванням
      }
      
      // Зберігаємо JWT в cookie для персистенції
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
    // Якщо вікно закрито без відповіді - resolve(false)
    ipcMain.removeAllListeners('jwt-submitted');
    ipcMain.removeAllListeners('cookie-cancelled');
  });
  
  // Якщо вікно закривається кнопкою X без submit/cancel
  authWindow.on('close', () => {
    // resolve вже може бути викликаний, тому перевіряємо
    setTimeout(() => {
      if (authWindow === null) return; // вже оброблено
      resolve(false);
    }, 100);
  });
}

// Перевіряємо авторизацію - тепер перевіряємо JWT токен
ipcMain.handle('check-auth', async () => {
  try {
    // Спочатку перевіряємо кеш
    if (cachedJwtToken && Date.now() < jwtTokenExpiry - 60000) {
      console.log('Check auth - cached JWT valid');
      return true;
    }
    
    // Завантажуємо з cookies
    const sunoSession = session.fromPartition('persist:suno');
    const cookies = await sunoSession.cookies.get({ url: SUNO_URL });
    
    const jwtCookie = cookies.find(c => c.name === '__jwt_token');
    
    if (jwtCookie && jwtCookie.value) {
      // Перевіряємо чи токен ще дійсний
      try {
        const payload = JSON.parse(Buffer.from(jwtCookie.value.split('.')[1], 'base64').toString());
        if (payload.exp * 1000 > Date.now()) {
          cachedJwtToken = jwtCookie.value;
          jwtTokenExpiry = payload.exp * 1000;
          console.log('Check auth - JWT loaded from cookie, valid until:', new Date(jwtTokenExpiry));
          return true;
        }
      } catch (e) {
        console.log('JWT parse error:', e.message);
      }
    }
    
    console.log('Check auth - no valid JWT found');
    return false;
  } catch (e) {
    console.log('Check auth error:', e.message);
    return false;
  }
});

// Logout
ipcMain.handle('logout', async () => {
  try {
    await session.fromPartition('persist:suno').clearStorageData({
      storages: ['cookies', 'localstorage', 'sessionstorage']
    });
    // Скидаємо кешований JWT токен
    cachedJwtToken = null;
    jwtTokenExpiry = 0;
    console.log('Logout completed');
    return true;
  } catch (e) {
    console.log('Logout error:', e.message);
    return false;
  }
});

// Функція отримання JWT токена з кешу або cookies
async function getJwtToken() {
  // Перевіряємо чи токен ще дійсний (з запасом 60 сек)
  if (cachedJwtToken && Date.now() < jwtTokenExpiry - 60000) {
    return cachedJwtToken;
  }
  
  // Завантажуємо з cookies
  try {
    const sunoSession = session.fromPartition('persist:suno');
    const cookies = await sunoSession.cookies.get({ url: SUNO_URL });
    const jwtCookie = cookies.find(c => c.name === '__jwt_token');
    
    if (jwtCookie && jwtCookie.value) {
      const payload = JSON.parse(Buffer.from(jwtCookie.value.split('.')[1], 'base64').toString());
      if (payload.exp * 1000 > Date.now()) {
        cachedJwtToken = jwtCookie.value;
        jwtTokenExpiry = payload.exp * 1000;
        return cachedJwtToken;
      }
    }
  } catch (e) {
    console.log('Error loading JWT from cookies:', e.message);
  }
  
  return null;
}

// ============ API ЗАПИТИ ============
ipcMain.handle('api-request', async (event, { url, method = 'GET', body = null }) => {
  return new Promise(async (resolve) => {
    try {
      // Отримуємо JWT токен
      const jwtToken = await getJwtToken();
      
      if (!jwtToken) {
        console.log('No valid JWT token available');
        resolve({ ok: false, error: 'Not authenticated - please login again', status: 401 });
        return;
      }
      
      // Генеруємо browser-token як в браузері: {"token":"BASE64_TIMESTAMP_JSON"}
      const timestampJson = JSON.stringify({ timestamp: Date.now() });
      const base64Token = Buffer.from(timestampJson).toString('base64');
      const browserToken = JSON.stringify({ token: base64Token });
      
      // Постійний device-id
      let deviceId = 'd6d9cb68-255f-4da8-a39d-76d36b1454af';
      
      console.log('API Request:', url);
      console.log('JWT token length:', jwtToken.length);
      
      const urlObj = new URL(url);
      
      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: method,
        headers: {
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'uk,en-US;q=0.9,en;q=0.8',
          'Authorization': `Bearer ${jwtToken}`,
          'Cache-Control': 'no-cache',
          'Origin': 'https://suno.com',
          'Pragma': 'no-cache',
          'Referer': 'https://suno.com/',
          'browser-token': browserToken,
          'device-id': deviceId,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
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
        
        console.log('API Response status:', res.statusCode);
        
        res.on('data', chunk => chunks.push(chunk));
        
        res.on('end', () => {
          let responseData = Buffer.concat(chunks);
          
          // Декомпресія якщо gzip
          const encoding = res.headers['content-encoding'];
          if (encoding === 'gzip' || encoding === 'br' || encoding === 'deflate') {
            try {
              const zlib = require('zlib');
              if (encoding === 'gzip') {
                responseData = zlib.gunzipSync(responseData);
              } else if (encoding === 'br') {
                responseData = zlib.brotliDecompressSync(responseData);
              } else if (encoding === 'deflate') {
                responseData = zlib.inflateSync(responseData);
              }
            } catch (e) {
              console.log('Decompression error:', e.message);
            }
          }
          
          const responseText = responseData.toString('utf8');
          
          try {
            const json = JSON.parse(responseText);
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data: json, status: res.statusCode });
          } catch (e) {
            console.log('Response parse error:', responseText.substring(0, 300));
            resolve({ ok: false, error: 'Invalid JSON', raw: responseText.substring(0, 500), status: res.statusCode });
          }
        });
      });
      
      req.on('error', error => {
        console.log('API error:', error.message);
        resolve({ ok: false, error: error.message });
      });
      
      if (body) req.write(JSON.stringify(body));
      req.end();
      
    } catch (error) {
      console.log('API handler error:', error.message);
      resolve({ ok: false, error: error.message });
    }
  });
});

// ============ ЗАПУСК ============
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
