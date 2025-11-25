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
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.focus();
    return;
  }
  
  authWindow = new BrowserWindow({
    width: 500,
    height: 450,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true,
    title: 'Авторизація - вставте Cookie',
    resizable: false,
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
        }
        h2 { margin-bottom: 15px; color: #a78bfa; }
        .instructions { 
          background: rgba(255,255,255,0.1); 
          padding: 15px; 
          border-radius: 8px; 
          margin-bottom: 15px;
          font-size: 13px;
          line-height: 1.5;
        }
        .instructions ol { margin-left: 20px; }
        .instructions li { margin: 5px 0; }
        .instructions code { 
          background: rgba(0,0,0,0.3); 
          padding: 2px 6px; 
          border-radius: 4px;
          font-family: monospace;
        }
        textarea { 
          width: 100%; 
          height: 120px; 
          padding: 10px;
          border: 2px solid #7c3aed;
          border-radius: 8px;
          background: rgba(255,255,255,0.1);
          color: white;
          font-family: monospace;
          font-size: 12px;
          resize: none;
          margin-bottom: 15px;
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
      </style>
    </head>
    <body>
      <h2>🔐 Авторизація Suno AI</h2>
      
      <div class="instructions">
        <p><strong>Інструкція:</strong></p>
        <ol>
          <li>У браузері, що відкрився, увійдіть до свого акаунту Suno</li>
          <li>Після входу натисніть <code>F12</code> → вкладка <code>Application</code> (або <code>Storage</code>)</li>
          <li>Зліва виберіть <code>Cookies</code> → <code>https://suno.com</code></li>
          <li>Знайдіть cookie <code>__session</code> і скопіюйте його <strong>Value</strong></li>
          <li>Вставте скопійоване значення нижче</li>
        </ol>
      </div>
      
      <textarea id="cookie-input" placeholder="Вставте значення cookie __session сюди..."></textarea>
      
      <div class="buttons">
        <button class="btn-secondary" onclick="cancel()">Скасувати</button>
        <button class="btn-primary" onclick="submit()">Авторизуватися</button>
      </div>
      
      <p class="error" id="error">Помилка: вставте правильне значення cookie</p>
      
      <script>
        const { ipcRenderer } = require('electron');
        
        function submit() {
          const value = document.getElementById('cookie-input').value.trim();
          if (!value || value.length < 50) {
            document.getElementById('error').style.display = 'block';
            return;
          }
          ipcRenderer.send('cookie-submitted', value);
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
  
  // Обробка відповіді
  ipcMain.once('cookie-submitted', async (event, sessionValue) => {
    console.log('Cookie submitted, length:', sessionValue.length);
    
    // Зберігаємо session cookie
    const sunoSession = session.fromPartition('persist:suno');
    
    try {
      // Зберігаємо __session cookie
      await sunoSession.cookies.set({
        url: SUNO_URL,
        name: '__session',
        value: sessionValue,
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'no_restriction',
      });
      
      // Також зберігаємо для API
      await sunoSession.cookies.set({
        url: SUNO_API_URL,
        name: '__session',
        value: sessionValue,
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'no_restriction',
      });
      
      console.log('Session cookie saved successfully');
      
      if (authWindow && !authWindow.isDestroyed()) {
        authWindow.close();
      }
      resolve(true);
    } catch (e) {
      console.log('Error saving cookie:', e.message);
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
    ipcMain.removeAllListeners('cookie-submitted');
    ipcMain.removeAllListeners('cookie-cancelled');
  });
}

// Перевіряємо авторизацію
ipcMain.handle('check-auth', async () => {
  try {
    const sunoSession = session.fromPartition('persist:suno');
    const cookies = await sunoSession.cookies.get({ url: SUNO_URL });
    
    const sessionCookie = cookies.find(c => c.name === '__session');
    
    console.log('Check auth - session:', !!sessionCookie, 'total cookies:', cookies.length);
    
    return !!sessionCookie;
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
    console.log('Logout completed');
    return true;
  } catch (e) {
    console.log('Logout error:', e.message);
    return false;
  }
});

// ============ API ЗАПИТИ ============
ipcMain.handle('api-request', async (event, { url, method = 'GET', body = null }) => {
  return new Promise(async (resolve) => {
    try {
      const sunoSession = session.fromPartition('persist:suno');
      const cookies = await sunoSession.cookies.get({ url: SUNO_URL });
      
      const sessionCookie = cookies.find(c => c.name === '__session');
      
      if (!sessionCookie) {
        console.log('No session cookie found for API request');
        resolve({ ok: false, error: 'Not authenticated', status: 401 });
        return;
      }
      
      // Генеруємо headers як в браузері
      const browserToken = JSON.stringify({ timestamp: Date.now() });
      const encodedToken = Buffer.from(browserToken).toString('base64');
      const deviceId = require('crypto').randomUUID();
      
      console.log('API Request:', url);
      
      const urlObj = new URL(url);
      
      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: method,
        headers: {
          'Accept': '*/*',
          'Accept-Language': 'uk,en-US;q=0.9,en;q=0.8',
          'Content-Type': 'application/json',
          'Origin': SUNO_URL,
          'Referer': `${SUNO_URL}/`,
          'browser-token': `{"token":"${encodedToken}"}`,
          'device-id': deviceId,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Cookie': `__session=${sessionCookie.value}`,
          'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
        }
      };
      
      if (body) {
        options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
      }
      
      const req = https.request(options, (res) => {
        let responseData = '';
        
        console.log('API Response status:', res.statusCode);
        
        res.on('data', chunk => responseData += chunk);
        
        res.on('end', () => {
          try {
            const json = JSON.parse(responseData);
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data: json, status: res.statusCode });
          } catch (e) {
            console.log('Response parse error:', responseData.substring(0, 300));
            resolve({ ok: false, error: 'Invalid JSON', raw: responseData.substring(0, 500), status: res.statusCode });
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
