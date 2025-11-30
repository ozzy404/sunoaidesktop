# Suno Desktop Player 🎵

Lightweight desktop player for listening to music from Suno AI.

🌐 **Language:** [Українська](README_UA.md) | [Русский](README_RU.md)

![Suno Desktop Player](https://img.shields.io/badge/version-1.0.0-purple)
![Platform](https://img.shields.io/badge/platform-Windows-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## 📥 Download

### [⬇️ Download Latest Release](../../releases/latest)

| File | Description |
|------|-------------|
| `Suno Desktop Player-Setup-x.x.x-x64.exe` | Installer for 64-bit Windows (recommended) |
| `Suno Desktop Player-Setup-x.x.x-ia32.exe` | Installer for 32-bit Windows |
| `Suno Desktop Player-Portable-x.x.x-x64.exe` | Portable version 64-bit (no installation) |
| `Suno Desktop Player-Portable-x.x.x-ia32.exe` | Portable version 32-bit |

> 💡 **Tip:** Most modern computers use 64-bit (x64). Use ia32 only for old 32-bit systems.

## ✨ Features

- 🔐 Suno AI account authorization
- 🎵 Listen to all your generated tracks
- ❤️ Browse liked songs
- 🔁 Track repeat mode
- 🎛️ Volume control
- ⌨️ Keyboard shortcuts (Space - play/pause, ←/→ - switch tracks)
- 📊 Minimal resource usage
- 🖥️ System tray minimization
- 🌐 Multi-language (English, Ukrainian, Russian)
- 🎨 Windows taskbar thumbnail controls

## 🔐 Authorization

1. Click "Sign In" in the app
2. Log in to suno.com in your browser
3. Press F12 → Network tab → Refresh page
4. Find any request to `studio-api.prod.suno.com`
5. Copy the `Authorization` header value (after "Bearer ")
6. Paste the token into the app

> ⚠️ Token is valid for ~1 hour. The app will notify you when it expires.

## 🎮 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `→` | Next track |
| `←` | Previous track |

## 💻 For Developers

### Run from source

1. Clone the repository:
```bash
git clone https://github.com/ozzy404/sunoaidesktop.git
cd sunoaidesktop
```

2. Install dependencies:
```bash
npm install
```

3. Run:
```bash
npm start
```

### Project Structure

```
sunoaidesktop/
├── src/
│   ├── main.js          # Electron main process
│   ├── preload.js       # Preload script (IPC bridge)
│   └── renderer/
│       ├── index.html   # Main page
│       ├── styles.css   # Styles
│       ├── app.js       # Player logic
│       └── i18n.js      # Translations
├── package.json
└── README.md
```

## 🛠️ Technologies

- **Electron 28** - cross-platform desktop framework
- **Vanilla JS** - no dependencies for speed
- **CSS3** - modern interface

## 📄 License

MIT License - free to use and modify.

## 🙏 Credits

- [Suno AI](https://suno.com) - music generation service
- [Electron](https://www.electronjs.org/) - app framework
