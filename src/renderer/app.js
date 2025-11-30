// Suno Desktop Player - Main App Logic
class SunoPlayer {
  constructor() {
    this.audio = document.getElementById('audio-player');
    this.tracks = [];
    this.likedTracks = [];
    this.currentTrackIndex = -1;
    this.currentTrackId = null;
    this.isPlaying = false;
    this.isRepeat = false;
    this.currentTab = 'all';
    this.currentPage = 0;
    this.hasMoreTracks = true;
    this.isAuthenticated = false;
    
    // API URLs
    this.API_BASE = 'https://studio-api.prod.suno.com';
    this.SUNO_BASE = 'https://suno.com';
    
    this.init();
  }

  init() {
    this.applyTranslations();
    this.bindEvents();
    this.checkAuth();
    this.setupAudioEvents();
    this.setupTokenExpiryListeners();
    
    // Listen for tray commands
    if (window.electronAPI) {
      window.electronAPI.onTrayTogglePlay(() => this.togglePlay());
    }
  }
  
  // Setup token expiry notifications from main process
  setupTokenExpiryListeners() {
    if (window.electronAPI) {
      // Token expiring soon (5 min warning)
      window.electronAPI.onTokenExpiringSoon?.(() => {
        this.showNotification(t('tokenExpiringSoon'), 'warning');
      });
      
      // Token expired
      window.electronAPI.onTokenExpired?.(() => {
        this.showNotification(t('sessionExpired'), 'error');
        setTimeout(() => this.logout(), 2000);
      });
    }
  }
  
  // Show notification banner
  showNotification(message, type = 'info') {
    // Remove existing notification if any
    const existing = document.querySelector('.notification-banner');
    if (existing) existing.remove();
    
    const banner = document.createElement('div');
    banner.className = `notification-banner notification-${type}`;
    banner.innerHTML = `
      <span>${message}</span>
      <button class="notification-close">&times;</button>
    `;
    
    banner.querySelector('.notification-close').addEventListener('click', () => banner.remove());
    
    document.body.appendChild(banner);
    
    // Auto-remove after 10 seconds for warnings
    if (type === 'warning') {
      setTimeout(() => banner.remove(), 10000);
    }
  }
  
  // Apply translations to all elements with data-i18n attribute
  applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      el.title = t(key);
    });
  }

  bindEvents() {
    // Title bar buttons
    document.getElementById('btn-minimize')?.addEventListener('click', () => {
      window.electronAPI?.minimize();
    });
    
    document.getElementById('btn-maximize')?.addEventListener('click', () => {
      window.electronAPI?.maximize();
    });
    
    document.getElementById('btn-close')?.addEventListener('click', () => {
      window.electronAPI?.close();
    });

    // Auth
    document.getElementById('btn-login')?.addEventListener('click', () => this.showAuthModal());
    document.getElementById('btn-logout')?.addEventListener('click', () => this.showSettingsModal());

    // Navigation tabs
    document.querySelectorAll('.nav-tab[data-tab]').forEach(tab => {
      tab.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });

    // Player controls
    document.getElementById('btn-play')?.addEventListener('click', () => this.togglePlay());
    document.getElementById('btn-prev')?.addEventListener('click', () => this.prevTrack());
    document.getElementById('btn-next')?.addEventListener('click', () => this.nextTrack());
    document.getElementById('btn-repeat')?.addEventListener('click', () => this.toggleRepeat());

    // Volume
    document.getElementById('volume-slider')?.addEventListener('input', (e) => {
      this.audio.volume = e.target.value / 100;
    });

    // Progress bar
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) {
      const seekToPosition = (e) => {
        const rect = progressBar.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        if (this.audio.duration && !isNaN(this.audio.duration)) {
          this.audio.currentTime = percent * this.audio.duration;
        }
      };
      
      progressBar.addEventListener('click', seekToPosition);
      
      let isDragging = false;
      progressBar.addEventListener('mousedown', (e) => {
        isDragging = true;
        seekToPosition(e);
      });
      document.addEventListener('mousemove', (e) => {
        if (isDragging) seekToPosition(e);
      });
      document.addEventListener('mouseup', () => {
        isDragging = false;
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        this.togglePlay();
      }
      if (e.code === 'ArrowRight') this.nextTrack();
      if (e.code === 'ArrowLeft') this.prevTrack();
    });
  }

  setupAudioEvents() {
    this.audio.addEventListener('timeupdate', () => this.updateProgress());
    this.audio.addEventListener('ended', () => this.onTrackEnd());
    this.audio.addEventListener('play', () => {
      this.updatePlayButton(true);
      this.isPlaying = true;
      this.renderTracks();
      if (window.electronAPI?.notifyPlaybackState) {
        window.electronAPI.notifyPlaybackState(true);
      }
    });
    this.audio.addEventListener('pause', () => {
      this.updatePlayButton(false);
      this.isPlaying = false;
      this.renderTracks();
      if (window.electronAPI?.notifyPlaybackState) {
        window.electronAPI.notifyPlaybackState(false);
      }
    });
    this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
    
    // Windows taskbar thumbnail toolbar commands
    if (window.electronAPI) {
      window.electronAPI.onThumbarPrev?.(() => this.prevTrack());
      window.electronAPI.onThumbarPlayPause?.(() => this.togglePlay());
      window.electronAPI.onThumbarNext?.(() => this.nextTrack());
    }
  }

  // ============ Authentication ============
  async checkAuth() {
    if (window.electronAPI) {
      const isAuth = await window.electronAPI.checkAuth();
      if (isAuth) {
        this.isAuthenticated = true;
        this.showPlayerScreen();
        this.loadTracks();
        return;
      }
    }
    this.showAuthScreen();
  }

  async showAuthModal() {
    if (window.electronAPI) {
      const success = await window.electronAPI.openAuthWindow();
      if (success) {
        this.isAuthenticated = true;
        this.showPlayerScreen();
        this.loadTracks();
      }
    }
  }

  async logout() {
    if (window.electronAPI) {
      await window.electronAPI.logout();
    }
    this.isAuthenticated = false;
    this.tracks = [];
    this.likedTracks = [];
    this.showAuthScreen();
  }

  showAuthScreen() {
    document.getElementById('auth-screen')?.classList.remove('hidden');
    document.getElementById('player-screen')?.classList.add('hidden');
  }

  showPlayerScreen() {
    document.getElementById('auth-screen')?.classList.add('hidden');
    document.getElementById('player-screen')?.classList.remove('hidden');
  }

  // ============ API Calls ============
  async loadTracks() {
    this.showLoading(true);
    
    try {
      console.log('Loading all tracks...');
      const allTracks = await this.fetchUserTracks(false);
      this.tracks = allTracks;
      console.log('Loaded all tracks:', allTracks.length);
      
      console.log('Loading liked tracks...');
      const likedTracks = await this.fetchUserTracks(true);
      this.likedTracks = likedTracks;
      console.log('Loaded liked tracks:', likedTracks.length);
      
      this.renderTracks();
      
      if (allTracks.length === 0) {
        this.showNotification(t('noTracksFound'));
      }
    } catch (error) {
      console.error('Failed to load tracks:', error);
      this.showNotification(t('loadError') + error.message);
      this.loadDemoTracks();
    }
    
    this.showLoading(false);
  }

  async fetchUserTracks(likedOnly = false, page = 0) {
    let url = `${this.API_BASE}/api/feed/v2?hide_disliked=true&hide_gen_stems=true&hide_studio_clips=true&page=${page}`;
    
    if (likedOnly) {
      url = `${this.API_BASE}/api/feed/v2?is_liked=true&hide_disliked=true&hide_gen_stems=true&hide_studio_clips=true&page=${page}`;
    }
    
    console.log('Fetching tracks from:', url);
    
    if (window.electronAPI?.apiRequest) {
      const result = await window.electronAPI.apiRequest({ url, method: 'GET' });
      
      console.log('API Result:', result);
      
      if (result.ok && result.data) {
        const clips = result.data.clips || result.data.items || [];
        console.log('Got clips:', clips.length);
        return this.formatTracks(clips);
      } else {
        console.error('API error:', result.error || result.status);
        if (result.status === 401 || result.status === 403) {
          this.showNotification(t('sessionExpired'));
          this.logout();
        }
        throw new Error(result.error || 'API request failed');
      }
    }
    
    throw new Error('Electron API not available');
  }

  formatTracks(rawTracks) {
    return rawTracks.map(track => {
      let coverUrl = track.image_url || track.image_large_url || '';
      if (coverUrl && !coverUrl.startsWith('data:')) {
        if (coverUrl.startsWith('http:')) {
          coverUrl = coverUrl.replace('http:', 'https:');
        }
      }
      
      let audioUrl = track.audio_url || '';
      if (audioUrl && audioUrl.startsWith('http:')) {
        audioUrl = audioUrl.replace('http:', 'https:');
      }
      
      return {
        id: track.id,
        title: track.title || 'Untitled',
        artist: track.display_name || track.handle || 'Suno AI',
        cover: coverUrl,
        coverLarge: track.image_large_url || coverUrl,
        audio: audioUrl,
        duration: track.metadata?.duration || track.duration || 0,
        liked: track.is_liked === true,
        playCount: track.play_count || 0,
        tags: track.metadata?.tags || '',
        prompt: track.metadata?.prompt || '',
        createdAt: track.created_at,
        status: track.status
      };
    }).filter(track => track.status === 'complete' && track.audio);
  }

  loadDemoTracks() {
    this.tracks = [
      {
        id: 'demo1',
        title: 'Electric Dreams',
        artist: 'Suno AI',
        cover: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%237c3aed" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="white" font-size="40">🎵</text></svg>',
        audio: '',
        duration: 180,
        liked: true
      },
      {
        id: 'demo2',
        title: 'Neon Nights',
        artist: 'Suno AI',
        cover: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23ec4899" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="white" font-size="40">🎶</text></svg>',
        audio: '',
        duration: 210,
        liked: false
      },
      {
        id: 'demo3',
        title: 'Synthwave Sunset',
        artist: 'Suno AI',
        cover: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%2310b981" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="white" font-size="40">🎹</text></svg>',
        audio: '',
        duration: 195,
        liked: true
      }
    ];
    this.renderTracks();
  }

  // ============ Track Rendering ============
  renderTracks() {
    const container = document.getElementById('tracks-list');
    const emptyState = document.getElementById('empty-state');
    
    let filteredTracks = this.tracks;
    
    if (this.currentTab === 'liked') {
      filteredTracks = this.likedTracks.length > 0 ? this.likedTracks : this.tracks.filter(t => t.liked);
    }
    
    if (filteredTracks.length === 0) {
      container.innerHTML = '';
      emptyState?.classList.remove('hidden');
      return;
    }
    
    emptyState?.classList.add('hidden');
    this.currentTrackList = filteredTracks;
    
    const defaultCover = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#252542" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="#6b6b7b" font-size="40">🎵</text></svg>');
    
    container.innerHTML = filteredTracks.map((track, index) => {
      const coverSrc = track.cover || defaultCover;
      const isCurrentTrack = this.currentTrackId === track.id;
      const isPlayingThisTrack = isCurrentTrack && this.isPlaying;
      
      const playIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
      const pauseIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
      
      return `
        <div class="track-item ${isCurrentTrack ? 'playing' : ''}" 
             data-index="${index}" data-id="${track.id}">
          <div class="cover-wrapper">
            <img class="cover" src="${coverSrc}" alt="Cover" 
                 onerror="this.src='${defaultCover}'" 
                 loading="lazy">
            <div class="cover-overlay">
              ${isPlayingThisTrack ? pauseIcon : playIcon}
            </div>
          </div>
          <div class="info">
            <div class="title">${this.escapeHtml(track.title)}</div>
            <div class="meta">${this.escapeHtml(track.artist)} • ${this.formatTime(track.duration)}</div>
          </div>
          <button class="like-btn ${track.liked ? 'liked' : ''}" data-id="${track.id}">
            ${track.liked ? '❤️' : '🤍'}
          </button>
        </div>
      `;
    }).join('');
    
    // Pagination
    container.innerHTML += `
      <div class="pagination">
        <button class="pagination-btn" id="btn-prev-page" ${this.currentPage === 0 ? 'disabled' : ''}>
          ${t('prevPage')}
        </button>
        <span class="pagination-info">${t('page')} ${this.currentPage + 1}</span>
        <button class="pagination-btn" id="btn-next-page" ${!this.hasMoreTracks ? 'disabled' : ''}>
          ${t('nextPage')}
        </button>
      </div>
    `;

    // Bind events
    container.querySelectorAll('.track-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('like-btn')) {
          const index = parseInt(item.dataset.index);
          this.playTrack(index);
        }
      });
    });

    container.querySelectorAll('.like-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleLike(btn.dataset.id);
      });
    });
    
    document.getElementById('btn-prev-page')?.addEventListener('click', () => this.loadPage(this.currentPage - 1));
    document.getElementById('btn-next-page')?.addEventListener('click', () => this.loadPage(this.currentPage + 1));
  }
  
  async loadPage(page) {
    if (page < 0) return;
    
    this.currentPage = page;
    this.showLoading(true);
    
    try {
      const isLiked = this.currentTab === 'liked';
      const newTracks = await this.fetchUserTracks(isLiked, page);
      
      if (isLiked) {
        this.likedTracks = newTracks;
      } else {
        this.tracks = newTracks;
      }
      
      this.hasMoreTracks = newTracks.length >= 20;
      this.renderTracks();
      document.getElementById('tracks-container')?.scrollTo(0, 0);
    } catch (error) {
      console.error('Failed to load page:', error);
      this.showNotification(t('pageLoadError'));
    }
    
    this.showLoading(false);
  }

  showLoading(show) {
    const loading = document.getElementById('loading');
    const tracksList = document.getElementById('tracks-list');
    
    if (show) {
      loading?.classList.remove('hidden');
      tracksList?.classList.add('hidden');
    } else {
      loading?.classList.add('hidden');
      tracksList?.classList.remove('hidden');
    }
  }

  // ============ Playback ============
  playTrack(index) {
    const trackList = this.currentTrackList || this.tracks;
    if (index < 0 || index >= trackList.length) return;
    
    const track = trackList[index];
    this.currentTrackIndex = index;
    this.currentTrackId = track.id;
    
    const defaultCover = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#252542" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="#6b6b7b" font-size="40">🎵</text></svg>');
    
    const coverEl = document.getElementById('current-cover');
    if (coverEl) {
      coverEl.src = track.cover || defaultCover;
      coverEl.onerror = () => { coverEl.src = defaultCover; };
      coverEl.classList.remove('hidden'); // Show cover when track is selected
    }
    document.getElementById('current-title').textContent = track.title;
    document.getElementById('current-artist').textContent = track.artist;
    
    document.querySelectorAll('.track-item').forEach((item) => {
      item.classList.toggle('playing', item.dataset.id === track.id);
    });
    
    if (track.audio) {
      this.audio.src = track.audio;
      this.audio.play().catch(e => console.error('Playback failed:', e));
      this.isPlaying = true;
    } else {
      console.log('No audio URL for this track');
      this.showNotification(t('noAudio'));
    }
    
    this.updatePlayButton(this.isPlaying);
  }

  togglePlay() {
    if (this.currentTrackIndex === -1 && this.tracks.length > 0) {
      this.playTrack(0);
      return;
    }
    
    if (this.isPlaying) {
      this.audio.pause();
    } else {
      this.audio.play().catch(e => console.error('Playback failed:', e));
    }
    this.isPlaying = !this.isPlaying;
  }

  nextTrack() {
    const trackList = this.currentTrackList || this.tracks;
    if (trackList.length === 0) return;
    
    let nextIndex = this.currentTrackIndex + 1;
    if (nextIndex >= trackList.length) {
      nextIndex = 0;
    }
    this.playTrack(nextIndex);
  }

  prevTrack() {
    const trackList = this.currentTrackList || this.tracks;
    if (trackList.length === 0) return;
    
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }
    
    let prevIndex = this.currentTrackIndex - 1;
    if (prevIndex < 0) {
      prevIndex = trackList.length - 1;
    }
    this.playTrack(prevIndex);
  }

  toggleRepeat() {
    this.isRepeat = !this.isRepeat;
    this.audio.loop = this.isRepeat;
    document.getElementById('btn-repeat')?.classList.toggle('active', this.isRepeat);
  }

  onTrackEnd() {
    if (!this.isRepeat) {
      this.nextTrack();
    }
  }

  // ============ Progress & Time ============
  updateProgress() {
    if (!this.audio.duration) return;
    
    const percent = (this.audio.currentTime / this.audio.duration) * 100;
    document.getElementById('progress-fill').style.width = `${percent}%`;
    document.getElementById('time-current').textContent = this.formatTime(this.audio.currentTime);
  }

  updateDuration() {
    document.getElementById('time-total').textContent = this.formatTime(this.audio.duration);
  }

  updatePlayButton(playing) {
    const playIcon = document.querySelector('.icon-play');
    const pauseIcon = document.querySelector('.icon-pause');
    
    if (playing) {
      playIcon?.classList.add('hidden');
      pauseIcon?.classList.remove('hidden');
    } else {
      playIcon?.classList.remove('hidden');
      pauseIcon?.classList.add('hidden');
    }
  }

  // ============ Tabs & Settings ============
  switchTab(tab) {
    if (tab === 'settings') {
      this.showSettingsModal();
      return;
    }
    
    this.currentTab = tab;
    this.currentPage = 0;
    this.hasMoreTracks = true;
    
    document.querySelectorAll('.nav-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    
    this.renderTracks();
  }
  
  showSettingsModal() {
    let modal = document.getElementById('settings-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'settings-modal';
      
      const languages = window.i18n.getAvailableLanguages();
      const currentLang = window.i18n.getLanguage();
      const langOptions = languages.map(l => 
        `<option value="${l.code}" ${l.code === currentLang ? 'selected' : ''}>${l.name}</option>`
      ).join('');
      
      modal.innerHTML = `
        <div class="modal-overlay" onclick="window.sunoPlayer.hideSettingsModal()">
          <div class="modal-content" onclick="event.stopPropagation()">
            <h3>${t('settingsTitle')}</h3>
            <div class="settings-list">
              <div class="setting-item">
                <span>${t('volume')}</span>
                <input type="range" id="settings-volume" min="0" max="100" value="${Math.round(this.audio.volume * 100)}">
              </div>
              <div class="setting-item">
                <span>${t('repeatToggle')}</span>
                <label class="switch">
                  <input type="checkbox" id="settings-repeat" ${this.isRepeat ? 'checked' : ''}>
                  <span class="slider"></span>
                </label>
              </div>
              <div class="setting-item">
                <span>${t('language')}</span>
                <select id="settings-language">${langOptions}</select>
              </div>
              <hr>
              <button class="btn-logout-settings" onclick="window.sunoPlayer.logout(); window.sunoPlayer.hideSettingsModal();">${t('logout')}</button>
            </div>
            <button class="btn-close-modal" onclick="window.sunoPlayer.hideSettingsModal()">✕</button>
          </div>
        </div>
      `;
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 1000;
      `;
      document.body.appendChild(modal);
      
      const style = document.createElement('style');
      style.textContent = `
        .modal-overlay {
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.7);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .modal-content {
          background: #1a1a2e;
          border-radius: 16px;
          padding: 24px;
          width: 90%;
          max-width: 320px;
          position: relative;
        }
        .modal-content h3 {
          color: #a78bfa;
          margin-bottom: 20px;
        }
        .settings-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .setting-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: white;
        }
        .setting-item input[type="range"] {
          width: 120px;
        }
        .setting-item select {
          background: #2a2a4a;
          color: white;
          border: 1px solid #7c3aed;
          border-radius: 6px;
          padding: 6px 10px;
          cursor: pointer;
        }
        .btn-logout-settings {
          background: rgba(239, 68, 68, 0.2);
          color: #f87171;
          border: 1px solid #f87171;
          padding: 12px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          margin-top: 8px;
        }
        .btn-logout-settings:hover {
          background: rgba(239, 68, 68, 0.3);
        }
        .btn-close-modal {
          position: absolute;
          top: 12px;
          right: 12px;
          background: none;
          border: none;
          color: #6b6b7b;
          font-size: 20px;
          cursor: pointer;
        }
        hr {
          border: none;
          border-top: 1px solid #2a2a4a;
        }
        .switch {
          position: relative;
          width: 48px;
          height: 24px;
        }
        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #2a2a4a;
          transition: .3s;
          border-radius: 24px;
        }
        .slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .3s;
          border-radius: 50%;
        }
        input:checked + .slider {
          background-color: #7c3aed;
        }
        input:checked + .slider:before {
          transform: translateX(24px);
        }
      `;
      modal.appendChild(style);
      
      // Events
      document.getElementById('settings-volume').addEventListener('input', (e) => {
        this.audio.volume = e.target.value / 100;
      });
      document.getElementById('settings-repeat').addEventListener('change', (e) => {
        this.isRepeat = e.target.checked;
        this.audio.loop = this.isRepeat;
        document.getElementById('btn-repeat')?.classList.toggle('active', this.isRepeat);
      });
      document.getElementById('settings-language').addEventListener('change', (e) => {
        window.i18n.setLanguage(e.target.value);
        this.hideSettingsModal();
        this.applyTranslations();
        this.renderTracks();
        // Recreate modal with new language
        document.getElementById('settings-modal')?.remove();
      });
    } else {
      modal.style.display = 'block';
    }
  }
  
  hideSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  toggleLike(trackId) {
    const track = this.tracks.find(t => t.id === trackId);
    if (track) {
      track.liked = !track.liked;
      this.renderTracks();
    }
  }

  // ============ Utilities ============
  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showNotification(message) {
    console.log('Notification:', message);
    
    let notification = document.getElementById('notification');
    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'notification';
      notification.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(124, 58, 237, 0.95);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.3s;
        max-width: 80%;
        text-align: center;
      `;
      document.body.appendChild(notification);
    }
    
    notification.textContent = message;
    notification.style.opacity = '1';
    
    setTimeout(() => {
      notification.style.opacity = '0';
    }, 4000);
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.sunoPlayer = new SunoPlayer();
});
