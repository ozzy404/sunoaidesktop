# Suno Desktop Player 🎵

Lightweight desktop player for listening to music from Suno AI.

🌐 **Language:** [Українська](README_UA.md) | [Русский](README_RU.md)

![Suno Desktop Player](https://img.shields.io/badge/version-1.0.0-purple)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

- 🔐 Authorization via Google (Suno AI account)
- 🎵 Listen to all generated tracks
- ❤️ View liked songs
- 🔁 Track repeat mode
- 🎛️ Volume control
- ⌨️ Keyboard shortcuts (Space - play/pause, ←/→ - tracks)
- 📊 Minimal resource consumption
- 🖥️ System tray minimization
- 🌐 Multi-language support (English, Ukrainian, Russian)
- 🎨 Windows taskbar thumbnail controls

## 🚀 Installation

### Download ready build
Go to [Releases](../../releases) and download the version for your OS.

### Build from source

1. Clone the repository:
```bash
git clone https://github.com/ozzy404/sunoaidesktop.git
cd sunoaidesktop
```

2. Install dependencies:
```bash
npm install
```

3. Run for development:
```bash
npm start
```

4. Build for your platform:
```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## 🎮 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `→` | Next track |
| `←` | Previous track |

## 🛠️ Technologies

- **Electron** - cross-platform desktop framework
- **Vanilla JS** - no extra libraries for speed
- **CSS3** - modern interface

## 📁 Project Structure

```
sunoaidesktop/
├── src/
│   ├── main.js          # Electron main process
│   ├── preload.js       # Preload script for security
│   └── renderer/
│       ├── index.html   # Main page
│       ├── styles.css   # Styles
│       ├── i18n.js      # Internationalization
│       └── app.js       # Player logic
├── assets/
│   └── icon.png         # App icon
├── package.json
└── README.md
```

## ⚙️ How to Use

After first launch:
1. Click "Sign in with Google"
2. Suno page will open - click "Sign In" in the top right corner
3. Choose "Continue with Google" and select your account
4. Open DevTools (F12) → Console tab
5. Paste the code from the app to copy the JWT token
6. Paste the token in the app window
7. Enjoy the music! 🎶

**Note:** Token is valid for ~1 hour. Re-authenticate when it expires.

## 🌐 Language Settings

The app automatically detects your system language. You can also change it manually:
1. Click the ⚙️ settings button
2. Select your preferred language from the dropdown
3. The interface will update immediately

Supported languages:
- 🇬🇧 English (default)
- 🇺🇦 Ukrainian
- 🇷🇺 Russian

## 🔒 Security

- All data is stored locally
- Secure WebView is used for authorization
- Context isolation is enabled

## 🐛 Known Issues & Solutions

### "API request failed" after authorization

**Cause:** Outdated version of `src/main.js`

**Solution:**
1. Download the latest version from GitHub (Code → Download ZIP)
2. Replace the `src/main.js` file in your folder
3. Restart the app: `npm start`

### Tracks not loading

- Try re-logging (⚙️ → Log out)
- Check your internet connection
- Make sure your Suno account is active

## 📝 TODO

- [ ] Add playlists
- [ ] Offline track caching
- [ ] Equalizer
- [ ] Media key support

## 📄 License

MIT License - use as you wish!

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

---

**Author:** [ozzy404](https://github.com/ozzy404)

*Not an official Suno AI product*
