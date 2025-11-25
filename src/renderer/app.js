// Suno Desktop Player - Main App Logic
class SunoPlayer {
  constructor() {
    this.audio = document.getElementById('audio-player');
    this.tracks = [];
    this.currentTrackIndex = -1;
    this.isPlaying = false;
    this.isRepeat = false;
    this.currentTab = 'all';
    this.isAuthenticated = false;
    
    // API URLs
    this.API_BASE = 'https://studio-api.suno.ai';
    this.SUNO_BASE = 'https://suno.com';
    
    this.init();
  }

  init() {
    this.bindEvents();
    this.checkAuth();
    this.setupAudioEvents();
    
    // Слухаємо команди з трея
    if (window.electronAPI) {
      window.electronAPI.onTrayTogglePlay(() => this.togglePlay());
    }
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
    document.getElementById('auth-modal-close')?.addEventListener('click', () => this.hideAuthModal());

    // Navigation tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
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
    document.getElementById('progress-bar')?.addEventListener('click', (e) => {
      const rect = e.target.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      this.audio.currentTime = percent * this.audio.duration;
    });

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
    this.audio.addEventListener('play', () => this.updatePlayButton(true));
    this.audio.addEventListener('pause', () => this.updatePlayButton(false));
    this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
  }

  // ============ Authentication ============
  checkAuth() {
    // Перевіряємо чи є збережені дані
    const savedAuth = localStorage.getItem('suno_auth');
    if (savedAuth) {
      try {
        const authData = JSON.parse(savedAuth);
        if (authData.token && authData.expiry > Date.now()) {
          this.isAuthenticated = true;
          this.authToken = authData.token;
          this.showPlayerScreen();
          this.loadTracks();
          return;
        }
      } catch (e) {
        console.error('Auth check failed:', e);
      }
    }
    this.showAuthScreen();
  }

  showAuthModal() {
    const modal = document.getElementById('auth-modal');
    const webview = document.getElementById('auth-webview');
    
    if (webview) {
      webview.src = `${this.SUNO_BASE}/`;
      
      // Слухаємо зміни URL для відстеження авторизації
      webview.addEventListener('did-navigate', (e) => {
        this.checkAuthComplete(e.url);
      });
      
      webview.addEventListener('did-navigate-in-page', (e) => {
        this.checkAuthComplete(e.url);
      });
    }
    
    modal?.classList.remove('hidden');
  }

  hideAuthModal() {
    const modal = document.getElementById('auth-modal');
    const webview = document.getElementById('auth-webview');
    
    modal?.classList.add('hidden');
    if (webview) webview.src = '';
  }

  async checkAuthComplete(url) {
    // Перевіряємо чи користувач авторизувався
    if (url.includes('suno.com') && !url.includes('sign-in') && !url.includes('sign-up')) {
      // Спробуємо отримати cookies
      try {
        const cookies = await window.electronAPI?.getCookies();
        const sessionCookie = cookies?.find(c => c.name.includes('__session') || c.name.includes('__client'));
        
        if (sessionCookie) {
          this.authToken = sessionCookie.value;
          localStorage.setItem('suno_auth', JSON.stringify({
            token: this.authToken,
            expiry: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 днів
          }));
          
          this.isAuthenticated = true;
          this.hideAuthModal();
          this.showPlayerScreen();
          this.loadTracks();
        }
      } catch (e) {
        console.error('Failed to get cookies:', e);
      }
    }
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
      // Спочатку спробуємо API, якщо не працює - демо дані
      const tracks = await this.fetchUserTracks();
      this.tracks = tracks;
      this.renderTracks();
    } catch (error) {
      console.error('Failed to load tracks:', error);
      // Показуємо демо дані для тестування інтерфейсу
      this.loadDemoTracks();
    }
    
    this.showLoading(false);
  }

  async fetchUserTracks() {
    // Suno AI API endpoint для отримання треків користувача
    const response = await fetch(`${this.API_BASE}/api/feed/v2/?page=0`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error('API request failed');
    }

    const data = await response.json();
    return this.formatTracks(data.clips || data.items || []);
  }

  formatTracks(rawTracks) {
    return rawTracks.map(track => ({
      id: track.id,
      title: track.title || track.metadata?.prompt || 'Untitled',
      artist: track.display_name || 'Suno AI',
      cover: track.image_url || track.image_large_url || '',
      audio: track.audio_url || track.song_path || '',
      duration: track.metadata?.duration || 0,
      liked: track.is_liked || false,
      createdAt: track.created_at
    }));
  }

  loadDemoTracks() {
    // Демо треки для тестування UI
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
      filteredTracks = this.tracks.filter(t => t.liked);
    }
    
    if (filteredTracks.length === 0) {
      container.innerHTML = '';
      emptyState?.classList.remove('hidden');
      return;
    }
    
    emptyState?.classList.add('hidden');
    
    container.innerHTML = filteredTracks.map((track, index) => `
      <div class="track-item ${this.currentTrackIndex === index ? 'playing' : ''}" 
           data-index="${index}" data-id="${track.id}">
        <img class="cover" src="${track.cover}" alt="Cover" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect fill=%22%23252542%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2255%22 text-anchor=%22middle%22 fill=%22%236b6b7b%22 font-size=%2240%22>🎵</text></svg>'">
        <div class="info">
          <div class="title">${this.escapeHtml(track.title)}</div>
          <div class="meta">${this.escapeHtml(track.artist)}</div>
        </div>
        <span class="duration">${this.formatTime(track.duration)}</span>
        <button class="like-btn ${track.liked ? 'liked' : ''}" data-id="${track.id}">
          ${track.liked ? '❤️' : '🤍'}
        </button>
      </div>
    `).join('');

    // Bind click events
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
    if (index < 0 || index >= this.tracks.length) return;
    
    const track = this.tracks[index];
    this.currentTrackIndex = index;
    
    // Оновлюємо UI
    document.getElementById('current-cover').src = track.cover;
    document.getElementById('current-title').textContent = track.title;
    document.getElementById('current-artist').textContent = track.artist;
    
    // Оновлюємо виділення в списку
    document.querySelectorAll('.track-item').forEach((item, i) => {
      item.classList.toggle('playing', i === index);
    });
    
    // Відтворюємо аудіо
    if (track.audio) {
      this.audio.src = track.audio;
      this.audio.play().catch(e => console.error('Playback failed:', e));
      this.isPlaying = true;
    } else {
      // Якщо немає аудіо URL - показуємо повідомлення
      console.log('No audio URL for this track');
      this.showNotification('Аудіо недоступне для цього треку');
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
    if (this.tracks.length === 0) return;
    
    let nextIndex = this.currentTrackIndex + 1;
    if (nextIndex >= this.tracks.length) {
      nextIndex = 0;
    }
    this.playTrack(nextIndex);
  }

  prevTrack() {
    if (this.tracks.length === 0) return;
    
    // Якщо пройшло більше 3 секунд - перезапускаємо поточний трек
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }
    
    let prevIndex = this.currentTrackIndex - 1;
    if (prevIndex < 0) {
      prevIndex = this.tracks.length - 1;
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

  // ============ Tabs & Likes ============
  switchTab(tab) {
    this.currentTab = tab;
    
    document.querySelectorAll('.nav-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    
    this.renderTracks();
  }

  toggleLike(trackId) {
    const track = this.tracks.find(t => t.id === trackId);
    if (track) {
      track.liked = !track.liked;
      this.renderTracks();
      
      // TODO: Синхронізація з API
      // this.syncLikeToServer(trackId, track.liked);
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
    // Проста нотифікація
    console.log('Notification:', message);
  }

  // ============ Logout ============
  logout() {
    localStorage.removeItem('suno_auth');
    this.isAuthenticated = false;
    this.authToken = null;
    this.tracks = [];
    this.showAuthScreen();
  }
}

// Ініціалізація
document.addEventListener('DOMContentLoaded', () => {
  window.sunoPlayer = new SunoPlayer();
});
