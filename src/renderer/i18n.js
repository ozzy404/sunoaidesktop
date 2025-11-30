// Suno Desktop Player - Internationalization (i18n)

const translations = {
  en: {
    // App
    appTitle: 'Suno Player',
    
    // Auth screen
    authTitle: 'Suno Desktop Player',
    authSubtitle: 'Listen to your Suno AI music',
    loginButton: 'Sign In',
    loginHint: 'Connect to your Suno account',
    
    // Navigation
    navAllTracks: 'All Tracks',
    navLiked: 'Liked ❤️',
    settingsTooltip: 'Settings',
    
    // Player
    selectTrack: 'Select a track',
    loading: 'Loading tracks...',
    noTracks: '🎵 No tracks yet',
    noAudio: 'Audio unavailable for this track',
    
    // Controls
    previous: 'Previous',
    next: 'Next',
    playPause: 'Play/Pause',
    repeat: 'Repeat',
    
    // Pagination
    prevPage: '← Previous',
    nextPage: 'Next →',
    page: 'Page',
    
    // Settings modal
    settingsTitle: '⚙️ Settings',
    volume: '🔊 Volume',
    repeatToggle: '🔁 Repeat',
    language: '🌐 Language',
    logout: '🚪 Log out',
    
    // Notifications
    sessionExpired: 'Session expired. Please log in again.',
    tokenExpiringSoon: 'Session expires in {min} min. Re-login recommended.',
    loadError: 'Loading error: ',
    noTracksFound: 'No tracks found. Create music at suno.com first',
    pageLoadError: 'Error loading page',
    
    // Languages
    langEnglish: 'English',
    langUkrainian: 'Українська',
    langRussian: 'Русский'
  },
  
  uk: {
    // App
    appTitle: 'Suno Player',
    
    // Auth screen
    authTitle: 'Suno Desktop Player',
    authSubtitle: 'Слухай свою музику з Suno AI',
    loginButton: 'Увійти',
    loginHint: 'Відкриється сторінка Suno для входу',
    loginHintDetail: 'Натисніть "Sign In" на сторінці Suno і увійдіть',
    
    // Token expiry
    tokenExpiringSoon: '⏰ Сесія закінчується через 5 хвилин. Перезайдіть для продовження.',
    
    // Navigation
    navAllTracks: 'Всі треки',
    navLiked: 'Лайкнуті ❤️',
    settingsTooltip: 'Налаштування',
    
    // Player
    selectTrack: 'Виберіть трек',
    loading: 'Завантаження треків...',
    noTracks: '🎵 Треків поки немає',
    noAudio: 'Аудіо недоступне для цього треку',
    
    // Controls
    previous: 'Попередній',
    next: 'Наступний',
    playPause: 'Грати/Пауза',
    repeat: 'Повтор',
    
    // Pagination
    prevPage: '← Попередня',
    nextPage: 'Наступна →',
    page: 'Сторінка',
    
    // Settings modal
    settingsTitle: '⚙️ Налаштування',
    volume: '🔊 Гучність',
    repeatToggle: '🔁 Повтор',
    language: '🌐 Мова',
    logout: '🚪 Вийти з акаунту',
    
    // Notifications
    sessionExpired: 'Сесія закінчилась. Увійдіть знову.',
    loadError: 'Помилка завантаження: ',
    noTracksFound: 'Треків не знайдено. Спочатку створіть музику на suno.com',
    pageLoadError: 'Помилка завантаження сторінки',
    
    // Languages
    langEnglish: 'English',
    langUkrainian: 'Українська',
    langRussian: 'Русский'
  },
  
  ru: {
    // App
    appTitle: 'Suno Player',
    
    // Auth screen
    authTitle: 'Suno Desktop Player',
    authSubtitle: 'Слушай свою музыку из Suno AI',
    loginButton: 'Войти',
    loginHint: 'Откроется страница Suno для входа',
    loginHintDetail: 'Нажмите "Sign In" на странице Suno и войдите',
    
    // Token expiry
    tokenExpiringSoon: '⏰ Сессия истекает через 5 минут. Перезайдите для продолжения.',
    
    // Navigation
    navAllTracks: 'Все треки',
    navLiked: 'Понравившиеся ❤️',
    settingsTooltip: 'Настройки',
    
    // Player
    selectTrack: 'Выберите трек',
    loading: 'Загрузка треков...',
    noTracks: '🎵 Треков пока нет',
    noAudio: 'Аудио недоступно для этого трека',
    
    // Controls
    previous: 'Предыдущий',
    next: 'Следующий',
    playPause: 'Играть/Пауза',
    repeat: 'Повтор',
    
    // Pagination
    prevPage: '← Предыдущая',
    nextPage: 'Следующая →',
    page: 'Страница',
    
    // Settings modal
    settingsTitle: '⚙️ Настройки',
    volume: '🔊 Громкость',
    repeatToggle: '🔁 Повтор',
    language: '🌐 Язык',
    logout: '🚪 Выйти из аккаунта',
    
    // Notifications
    sessionExpired: 'Сессия истекла. Войдите снова.',
    loadError: 'Ошибка загрузки: ',
    noTracksFound: 'Треки не найдены. Сначала создайте музыку на suno.com',
    pageLoadError: 'Ошибка загрузки страницы',
    
    // Languages
    langEnglish: 'English',
    langUkrainian: 'Українська',
    langRussian: 'Русский'
  }
};

class I18n {
  constructor() {
    this.currentLang = 'en';
    this.init();
  }
  
  init() {
    // Check saved preference first
    const savedLang = localStorage.getItem('suno_language');
    if (savedLang && translations[savedLang]) {
      this.currentLang = savedLang;
    } else {
      // Auto-detect system language
      this.currentLang = this.detectSystemLanguage();
    }
  }
  
  detectSystemLanguage() {
    const lang = navigator.language || navigator.userLanguage || 'en';
    const langCode = lang.split('-')[0].toLowerCase();
    
    if (langCode === 'uk') return 'uk';
    if (langCode === 'ru') return 'ru';
    return 'en';
  }
  
  get(key) {
    return translations[this.currentLang]?.[key] || translations.en[key] || key;
  }
  
  setLanguage(lang) {
    if (translations[lang]) {
      this.currentLang = lang;
      localStorage.setItem('suno_language', lang);
      return true;
    }
    return false;
  }
  
  getLanguage() {
    return this.currentLang;
  }
  
  getAvailableLanguages() {
    return [
      { code: 'en', name: translations.en.langEnglish },
      { code: 'uk', name: translations.en.langUkrainian },
      { code: 'ru', name: translations.en.langRussian }
    ];
  }
}

// Global i18n instance
window.i18n = new I18n();

// Helper function
function t(key) {
  return window.i18n.get(key);
}
