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

// Session cookies for token refresh
let sessionCookies = null;

// URLs
const SUNO_URL = 'https://suno.com';
const CLERK_URL = 'https://clerk.suno.com';

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
    authTitle: 'Authorization',
    authHeader: '🔐 Suno AI Authorization',
    authInstructions: 'To authorize, you need to get the JWT token from Suno website:',
    step1: 'Log in to suno.com in your browser',
    step2: 'Press F12 to open Developer Tools',
    step3: 'Go to Network tab',
    step4: 'Refresh the page (F5)',
    step5: 'Find any request to studio-api.prod.suno.com',
    step6: 'Click on it → Headers tab',
    step7: 'Find "Authorization" header',
    step8: 'Copy the value after "Bearer "',
    placeholder: 'Paste JWT token here (starts with eyJ...)',
    tokenNote: '⚠️ Token expires in ~1 hour. The app will try to refresh automatically.',
    cancel: 'Cancel',
    authorize: 'Sign In',
    error: 'Error: paste a valid JWT token (starts with eyJ)',
    sessionInfo: 'Your session will be saved for automatic refresh.'
  },
  uk: {
    open: 'Відкрити',
    playPause: 'Грати/Пауза',
    exit: 'Вихід',
    previous: 'Попередній',
    pause: 'Пауза',
    play: 'Грати',
    next: 'Наступний',
    authTitle: 'Авторизація',
    authHeader: '🔐 Авторизація Suno AI',
    authInstructions: 'Для авторизації потрібно отримати JWT токен з сайту Suno:',
    step1: 'Увійдіть на suno.com у браузері',
    step2: 'Натисніть F12 щоб відкрити DevTools',
    step3: 'Перейдіть на вкладку Network',
    step4: 'Оновіть сторінку (F5)',
    step5: 'Знайдіть будь-який запит до studio-api.prod.suno.com',
    step6: 'Клікніть на нього → вкладка Headers',
    step7: 'Знайдіть заголовок "Authorization"',
    step8: 'Скопіюйте значення після "Bearer "',
    placeholder: 'Вставте JWT токен сюди (починається з eyJ...)',
    tokenNote: '⚠️ Токен діє ~1 годину. Додаток спробує оновити автоматично.',
    cancel: 'Скасувати',
    authorize: 'Увійти',
    error: 'Помилка: вставте правильний JWT токен (починається з eyJ)',
    sessionInfo: 'Ваша сесія буде збережена для автоматичного оновлення.'
  },
  ru: {
    open: 'Открыть',
    playPause: 'Играть/Пауза',
    exit: 'Выход',
    previous: 'Предыдущий',
    pause: 'Пауза',
    play: 'Играть',
    next: 'Следующий',
    authTitle: 'Авторизация',
    authHeader: '🔐 Авторизация Suno AI',
    authInstructions: 'Для авторизации нужно получить JWT токен с сайта Suno:',
    step1: 'Войдите на suno.com в браузере',
    step2: 'Нажмите F12 чтобы открыть DevTools',
    step3: 'Перейдите на вкладку Network',
    step4: 'Обновите страницу (F5)',
    step5: 'Найдите любой запрос к studio-api.prod.suno.com',
    step6: 'Кликните на него → вкладка Headers',
    step7: 'Найдите заголовок "Authorization"',
    step8: 'Скопируйте значение после "Bearer "',
    placeholder: 'Вставьте JWT токен сюда (начинается с eyJ...)',
    tokenNote: '⚠️ Токен действует ~1 час. Приложение попробует обновить автоматически.',
    cancel: 'Отмена',
    authorize: 'Войти',
    error: 'Ошибка: вставьте правильный JWT токен (начинается с eyJ)',
    sessionInfo: 'Ваша сессия будет сохранена для автоматического обновления.'
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
    
    const cx = 8, cy = 8, r = 7;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) <= r) {
          setPixel(x, y, 124, 58, 237, 255);
        }
      }
    }
    
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

// Authorization
ipcMain.handle('open-auth-window', async () => {
  return new Promise((resolve) => {
    console.log('Opening system browser for Suno login...');
    shell.openExternal(SUNO_URL);
    showTokenInputWindow(resolve);
  });
});

function showTokenInputWindow(resolve) {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.close();
    authWindow = null;
  }
  
  ipcMain.removeAllListeners('jwt-submitted');
  ipcMain.removeAllListeners('auth-cancelled');
  
  authWindow = new BrowserWindow({
    width: 520,
    height: 620,
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
          padding: 24px;
          height: 100vh;
          overflow-y: auto;
        }
        h2 { margin-bottom: 16px; color: #a78bfa; font-size: 20px; }
        .instructions { 
          background: rgba(255,255,255,0.08); 
          padding: 16px; 
          border-radius: 12px; 
          margin-bottom: 16px;
          font-size: 13px;
          line-height: 1.7;
        }
        .instructions p { margin-bottom: 12px; color: #a78bfa; font-weight: 600; }
        .steps { 
          background: rgba(124, 58, 237, 0.15); 
          padding: 14px; 
          border-radius: 8px;
          border-left: 3px solid #7c3aed;
        }
        .step { 
          display: flex; 
          align-items: flex-start; 
          margin: 8px 0;
          color: #e2e8f0;
        }
        .step-num {
          background: #7c3aed;
          color: white;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: bold;
          margin-right: 10px;
          flex-shrink: 0;
        }
        .highlight { color: #fbbf24; font-weight: 500; }
        textarea { 
          width: 100%; 
          height: 90px; 
          padding: 12px;
          border: 2px solid #7c3aed;
          border-radius: 10px;
          background: rgba(255,255,255,0.08);
          color: white;
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 12px;
          resize: none;
          margin-bottom: 8px;
        }
        textarea:focus { outline: none; border-color: #a78bfa; background: rgba(255,255,255,0.12); }
        textarea::placeholder { color: rgba(255,255,255,0.4); }
        .buttons { display: flex; gap: 12px; margin-top: 12px; }
        button {
          flex: 1;
          padding: 14px;
          border: none;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-primary { 
          background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); 
          color: white; 
        }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(124,58,237,0.4); }
        .btn-secondary { background: rgba(255,255,255,0.1); color: white; }
        .btn-secondary:hover { background: rgba(255,255,255,0.15); }
        .error { color: #f87171; font-size: 12px; margin-top: 8px; display: none; text-align: center; }
        .note { color: #94a3b8; font-size: 12px; margin-top: 4px; }
        .session-info { 
          color: #10b981; 
          font-size: 11px; 
          margin-top: 8px; 
          text-align: center;
          opacity: 0.9;
        }
      </style>
    </head>
    <body>
      <h2>${tr.authHeader}</h2>
      
      <div class="instructions">
        <p>${tr.authInstructions}</p>
        <div class="steps">
          <div class="step"><span class="step-num">1</span>${tr.step1}</div>
          <div class="step"><span class="step-num">2</span>${tr.step2}</div>
          <div class="step"><span class="step-num">3</span>${tr.step3}</div>
          <div class="step"><span class="step-num">4</span>${tr.step4}</div>
          <div class="step"><span class="step-num">5</span>${tr.step5}</div>
          <div class="step"><span class="step-num">6</span>${tr.step6}</div>
          <div class="step"><span class="step-num">7</span>${tr.step7} <span class="highlight">"Authorization"</span></div>
          <div class="step"><span class="step-num">8</span>${tr.step8}</div>
        </div>
      </div>
      
      <textarea id="token-input" placeholder="${tr.placeholder}" spellcheck="false"></textarea>
      <p class="note">${tr.tokenNote}</p>
      <p class="session-info">✓ ${tr.sessionInfo}</p>
      
      <div class="buttons">
        <button class="btn-secondary" onclick="cancel()">${tr.cancel}</button>
        <button class="btn-primary" onclick="submit()">🚀 ${tr.authorize}</button>
      </div>
      
      <p class="error" id="error">${tr.error}</p>
      
      <script>
        const { ipcRenderer } = require('electron');
        
        function submit() {
          let value = document.getElementById('token-input').value.trim();
          // Remove "Bearer " prefix if pasted with it
          if (value.toLowerCase().startsWith('bearer ')) {
            value = value.substring(7).trim();
          }
          // Validate JWT format
          if (!value || !value.startsWith('eyJ') || value.split('.').length !== 3) {
            document.getElementById('error').style.display = 'block';
            return;
          }
          ipcRenderer.send('jwt-submitted', value);
        }
        
        function cancel() {
          ipcRenderer.send('auth-cancelled');
        }
        
        // Submit on Ctrl+Enter
        document.getElementById('token-input').addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && e.ctrlKey) submit();
        });
        
        // Auto-focus
        document.getElementById('token-input').focus();
      </script>
    </body>
    </html>
  `;
  
  authWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  
  ipcMain.once('jwt-submitted', async (event, jwtToken) => {
    console.log('JWT submitted, length:', jwtToken.length);
    
    try {
      cachedJwtToken = jwtToken;
      
      // Parse JWT to get expiry
      try {
        const payload = JSON.parse(Buffer.from(jwtToken.split('.')[1], 'base64').toString());
        jwtTokenExpiry = payload.exp * 1000;
        console.log('JWT token expires:', new Date(jwtTokenExpiry));
        
        // Extract user info for later refresh attempts
        if (payload.sub) {
          sessionCookies = { userId: payload.sub };
        }
      } catch (e) {
        jwtTokenExpiry = Date.now() + 3600000; // Default 1 hour
      }
      
      // Save to persistent storage
      const sunoSession = session.fromPartition('persist:suno');
      await sunoSession.cookies.set({
        url: SUNO_URL,
        name: '__jwt_token',
        value: jwtToken,
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'no_restriction',
        expirationDate: Math.floor(Date.now() / 1000) + 86400 * 30, // Store for 30 days
      });
      
      // Store expiry separately
      await sunoSession.cookies.set({
        url: SUNO_URL,
        name: '__jwt_expiry',
        value: String(jwtTokenExpiry),
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'no_restriction',
        expirationDate: Math.floor(Date.now() / 1000) + 86400 * 30,
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
  
  ipcMain.once('auth-cancelled', () => {
    if (authWindow && !authWindow.isDestroyed()) {
      authWindow.close();
    }
    resolve(false);
  });
  
  authWindow.on('closed', () => {
    authWindow = null;
    ipcMain.removeAllListeners('jwt-submitted');
    ipcMain.removeAllListeners('auth-cancelled');
  });
}

// Check authentication
ipcMain.handle('check-auth', async () => {
  try {
    // Check cached token first
    if (cachedJwtToken && Date.now() < jwtTokenExpiry - 60000) {
      return true;
    }
    
    // Load from cookies
    const sunoSession = session.fromPartition('persist:suno');
    const cookies = await sunoSession.cookies.get({ url: SUNO_URL });
    
    const jwtCookie = cookies.find(c => c.name === '__jwt_token');
    const expiryCookie = cookies.find(c => c.name === '__jwt_expiry');
    
    if (jwtCookie?.value) {
      const expiry = expiryCookie ? parseInt(expiryCookie.value) : 0;
      
      // Check if token is still valid
      if (expiry > Date.now()) {
        cachedJwtToken = jwtCookie.value;
        jwtTokenExpiry = expiry;
        console.log('Loaded valid token from storage, expires:', new Date(jwtTokenExpiry));
        return true;
      }
      
      // Token expired - notify user
      console.log('Token expired at:', new Date(expiry));
      
      // Send notification to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('token-expired');
      }
    }
    
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
    cachedJwtToken = null;
    jwtTokenExpiry = 0;
    sessionCookies = null;
    return true;
  } catch (e) {
    return false;
  }
});

// Get JWT token (with expiry check)
async function getJwtToken() {
  // Check if cached token is still valid (with 60 sec buffer)
  if (cachedJwtToken && Date.now() < jwtTokenExpiry - 60000) {
    return cachedJwtToken;
  }
  
  // Try to load from storage
  try {
    const sunoSession = session.fromPartition('persist:suno');
    const cookies = await sunoSession.cookies.get({ url: SUNO_URL });
    
    const jwtCookie = cookies.find(c => c.name === '__jwt_token');
    const expiryCookie = cookies.find(c => c.name === '__jwt_expiry');
    
    if (jwtCookie?.value) {
      const expiry = expiryCookie ? parseInt(expiryCookie.value) : 0;
      
      if (expiry > Date.now()) {
        cachedJwtToken = jwtCookie.value;
        jwtTokenExpiry = expiry;
        return cachedJwtToken;
      }
    }
  } catch (e) {
    console.log('Error loading JWT:', e.message);
  }
  
  return null;
}

// Check token expiry and notify renderer
function startTokenExpiryCheck() {
  setInterval(async () => {
    if (cachedJwtToken && jwtTokenExpiry) {
      const timeLeft = jwtTokenExpiry - Date.now();
      
      // Warn 5 minutes before expiry
      if (timeLeft > 0 && timeLeft < 5 * 60 * 1000) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('token-expiring-soon', Math.floor(timeLeft / 1000));
        }
      }
      
      // Token expired
      if (timeLeft <= 0) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('token-expired');
        }
      }
    }
  }, 60000); // Check every minute
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
      
      const browserToken = JSON.stringify({ 
        token: Buffer.from(JSON.stringify({ timestamp: Date.now() })).toString('base64') 
      });
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
app.whenReady().then(() => {
  createWindow();
  startTokenExpiryCheck();
});

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
