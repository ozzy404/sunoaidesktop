// Suno Desktop Player - Main App Logic
class SunoPlayer {
  constructor() {
    this.audio = document.getElementById('audio-player');
    this.tracks = [];
    this.likedTracks = [];
    this.currentTrackIndex = -1;
    this.isPlaying = false;
    this.isRepeat = false;
    this.currentTab = 'all';
    this.isAuthenticated = false;
    
    // API URLs - оновлені на основі HAR файлу
    this.API_BASE = 'https://studio-api.prod.suno.com';
    this.SUNO_BASE = 'https://suno.com';
    this.CLERK_BASE = 'https://clerk.suno.com';
    
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
    document.getElementById('btn-logout')?.addEventListener('click', () => this.logout());

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
  async checkAuth() {
    // Використовуємо Electron API для перевірки сесії
    if (window.electronAPI) {
      const isAuth = await window.electronAPI.checkAuth();
      if (isAuth) {
        this.isAuthenticated = true;
        this.showPlayerScreen();
        this.loadTracks();
        return;
      }
    }
    
    // Якщо не авторизовані - показуємо екран логіну
    this.showAuthScreen();
  }

  async showAuthModal() {
    // Використовуємо Electron вікно для авторизації
    if (window.electronAPI) {
      const success = await window.electronAPI.openAuthWindow();
      if (success) {
        this.isAuthenticated = true;
        this.showPlayerScreen();
        this.loadTracks();
      }
    }
  }

  hideAuthModal() {
    // Вже не потрібно - авторизація в окремому вікні
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
      // Завантажуємо всі треки
      const allTracks = await this.fetchUserTracks(false);
      this.tracks = allTracks;
      
      // Завантажуємо лайкнуті треки
      const likedTracks = await this.fetchUserTracks(true);
      this.likedTracks = likedTracks;
      
      this.renderTracks();
    } catch (error) {
      console.error('Failed to load tracks:', error);
      // Показуємо демо дані для тестування інтерфейсу
      this.loadDemoTracks();
    }
    
    this.showLoading(false);
  }

  async fetchUserTracks(likedOnly = false) {
    // Suno AI API endpoint - на основі HAR файлу
    let url = `${this.API_BASE}/api/feed/v2?hide_disliked=true&hide_gen_stems=true&hide_studio_clips=true&page=0`;
    
    if (likedOnly) {
      url = `${this.API_BASE}/api/feed/v2?is_liked=true&hide_disliked=true&hide_gen_stems=true&hide_studio_clips=true&page=0`;
    }
    
    // Використовуємо Electron API для запиту (уникаємо CORS)
    if (window.electronAPI?.apiRequest) {
      const result = await window.electronAPI.apiRequest({ url, method: 'GET' });
      
      if (result.ok && result.data) {
        return this.formatTracks(result.data.clips || result.data.items || []);
      } else {
        console.error('API error:', result.error);
        throw new Error(result.error || 'API request failed');
      }
    }
    
    // Fallback для браузера (тестування)
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Origin': 'https://suno.com',
        'Referer': 'https://suno.com/',
      }
    });

    if (!response.ok) {
      throw new Error('API request failed');
    }

    const data = await response.json();
    return this.formatTracks(data.clips || data.items || []);
  }

  formatTracks(rawTracks) {
    // Формат даних на основі HAR файлу
    return rawTracks.map(track => ({
      id: track.id,
      title: track.title || 'Untitled',
      artist: track.display_name || 'Suno AI',
      cover: track.image_url || track.image_large_url || '',
      coverLarge: track.image_large_url || track.image_url || '',
      audio: track.audio_url || '',
      duration: track.metadata?.duration || 0,
      liked: track.is_liked || false,
      playCount: track.play_count || 0,
      tags: track.metadata?.tags || '',
      createdAt: track.created_at,
      status: track.status
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
    
    // Вибираємо треки залежно від вкладки
    let filteredTracks = this.tracks;
    
    if (this.currentTab === 'liked') {
      // Використовуємо окремо завантажені лайкнуті треки
      filteredTracks = this.likedTracks.length > 0 ? this.likedTracks : this.tracks.filter(t => t.liked);
    }
    
    if (filteredTracks.length === 0) {
      container.innerHTML = '';
      emptyState?.classList.remove('hidden');
      return;
    }
    
    emptyState?.classList.add('hidden');
    
    // Зберігаємо поточний список для навігації
    this.currentTrackList = filteredTracks;
    
    container.innerHTML = filteredTracks.map((track, index) => `
      <div class="track-item ${this.currentTrackIndex === index && this.currentTrackList === filteredTracks ? 'playing' : ''}" 
           data-index="${index}" data-id="${track.id}">
        <img class="cover" src="${track.cover}" alt="Cover" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect fill=%22%23252542%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2255%22 text-anchor=%22middle%22 fill=%22%236b6b7b%22 font-size=%2240%22>🎵</text></svg>'">
        <div class="info">
          <div class="title">${this.escapeHtml(track.title)}</div>
          <div class="meta">${this.escapeHtml(track.artist)} • ${track.playCount || 0} plays</div>
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
