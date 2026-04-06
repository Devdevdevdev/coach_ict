const onboardingViewEl = document.getElementById('onboardingView');
const chatViewEl = document.getElementById('chatView');
const onboardingFormEl = document.getElementById('onboardingForm');
const onboardingErrorEl = document.getElementById('onboardingError');
const onboardingKimiEl = document.getElementById('onboardingKimiApiKey');
const onboardingTvEl = document.getElementById('onboardingTvSession');
const accessContinueButtonEl = document.getElementById('accessContinueButton');
const accessScreenButtonEl = document.getElementById('accessScreenButton');

const messagesEl = document.getElementById('messages');
const formEl = document.getElementById('chatForm');
const inputEl = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const langToggleEl = document.getElementById('langToggle');
const strictToggleEl = document.getElementById('strictToggle');

const ui = {
  appTitle: document.getElementById('appTitle'),
  appSubtitle: document.getElementById('appSubtitle'),
  accessTitle: document.getElementById('accessTitle'),
  accessSubtle: document.getElementById('accessSubtle'),
  kimiLabel: document.getElementById('kimiLabel'),
  tvLabel: document.getElementById('tvLabel'),
  accessHint: document.getElementById('accessHint'),
  assistantTitle: document.getElementById('assistantTitle'),
  strictHint: document.getElementById('strictHint')
};

const storage = {
  kimiApiKey: 'kimi_tradingview_kimi_api_key',
  tvSession: 'kimi_tradingview_tv_session',
  language: 'kimi_tradingview_language',
  strictMode: 'kimi_tradingview_strict_mode',
  accessValidated: 'kimi_tradingview_access_validated'
};

const dictionary = {
  fr: {
    appTitle: 'COACH ICT',
    appSubtitle: "Mon coach ICT/SMC: analyse multi-timeframe et points d'entrée précis.",
    accessTitle: 'Accès utilisateur',
    accessSubtle: 'Renseigne tes accès une fois, puis passe au coaching.',
    kimiLabel: 'Clé API Kimi',
    tvLabel: 'ID / Session TradingView',
    accessHint: "Aucune clé n'est commitée. BYOK obligatoire pour chaque utilisateur.",
    assistantTitle: 'Mon COACH ICT',
    strictHint: 'Mode ICT strict actif: Biais 1H, Setup 15M, Entrée 5M, SL/TP/RR, Invalidations.',
    inputPlaceholder: 'Ex: XAUUSD (le coach analysera automatiquement 1H, 15M, 5M)',
    tvPlaceholder: 'session id / token local',
    send: 'Envoyer',
    sending: 'Envoi...',
    loading: 'Analyse ICT en cours...',
    serverError: 'Erreur serveur',
    networkError: 'Erreur réseau',
    emptyResponse: '(réponse vide)',
    emptyMessage: 'Veuillez saisir un message avant envoi.',
    strictOn: 'ICT STRICT: ON',
    strictOff: 'ICT STRICT: OFF',
    accessButton: 'Accès',
    accessContinue: 'Valider les accès',
    accessRequired: 'La clé Kimi et l’ID/session TradingView sont requis.',
    welcome: 'COACH ICT prêt. Indique seulement la paire/symbole à analyser (ex: XAUUSD).'
  },
  en: {
    appTitle: 'COACH ICT',
    appSubtitle: 'My ICT/SMC coach: multi-timeframe analysis and precise entries.',
    accessTitle: 'User Access',
    accessSubtle: 'Set your credentials once, then move to coaching.',
    kimiLabel: 'Kimi API Key',
    tvLabel: 'TradingView ID / Session',
    accessHint: 'No key is committed. BYOK is required for every user.',
    assistantTitle: 'My ICT COACH',
    strictHint: 'ICT strict mode active: 1H Bias, 15M Setup, 5M Entry, SL/TP/RR, Invalidations.',
    inputPlaceholder: 'Ex: XAUUSD (coach will automatically analyze 1H, 15M, 5M)',
    tvPlaceholder: 'session id / local token',
    send: 'Send',
    sending: 'Sending...',
    loading: 'ICT analysis in progress...',
    serverError: 'Server error',
    networkError: 'Network error',
    emptyResponse: '(empty response)',
    emptyMessage: 'Please enter a message before sending.',
    strictOn: 'ICT STRICT: ON',
    strictOff: 'ICT STRICT: OFF',
    accessButton: 'Access',
    accessContinue: 'Validate access',
    accessRequired: 'Kimi key and TradingView ID/session are required.',
    welcome: 'COACH ICT ready. Enter only the symbol/pair to analyze (ex: XAUUSD).'
  }
};

let currentLanguage = localStorage.getItem(storage.language) === 'en' ? 'en' : 'fr';
let strictMode = localStorage.getItem(storage.strictMode) !== 'false';
let accessValidated = localStorage.getItem(storage.accessValidated) === 'true';

function getStoredCredentials() {
  return {
    kimiApiKey: (localStorage.getItem(storage.kimiApiKey) || '').trim(),
    tradingviewSession: (localStorage.getItem(storage.tvSession) || '').trim()
  };
}

function hasValidCredentials() {
  const creds = getStoredCredentials();
  return Boolean(creds.kimiApiKey && creds.tradingviewSession);
}

function t(key) {
  return dictionary[currentLanguage][key];
}

function setView(mode) {
  const onboarding = mode === 'onboarding';
  onboardingViewEl.classList.toggle('hidden', !onboarding);
  chatViewEl.classList.toggle('hidden', onboarding);
}

function addMessage(role, text) {
  const node = document.createElement('article');
  node.className = `msg ${role}`;
  node.textContent = text;
  messagesEl.appendChild(node);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return node;
}

function cleanCoachText(text) {
  return String(text || '')
    .replace(/\*\*/g, '')
    .replace(/^##+\s?/gm, '')
    .replace(/^#+\s?/gm, '')
    .trim();
}

function addLoadingMessage() {
  const node = document.createElement('article');
  node.className = 'msg assistant loading';
  node.textContent = t('loading');
  const dots = document.createElement('span');
  dots.className = 'loading-dots';
  dots.textContent = '...';
  node.appendChild(dots);
  messagesEl.appendChild(node);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return node;
}

function applyLanguage() {
  document.documentElement.lang = currentLanguage;
  ui.appTitle.textContent = t('appTitle');
  ui.appSubtitle.textContent = t('appSubtitle');
  ui.accessTitle.textContent = t('accessTitle');
  ui.accessSubtle.textContent = t('accessSubtle');
  ui.kimiLabel.textContent = t('kimiLabel');
  ui.tvLabel.textContent = t('tvLabel');
  ui.accessHint.textContent = t('accessHint');
  ui.assistantTitle.textContent = t('assistantTitle');
  ui.strictHint.textContent = t('strictHint');
  inputEl.placeholder = t('inputPlaceholder');
  onboardingTvEl.placeholder = t('tvPlaceholder');
  sendButton.textContent = t('send');
  accessContinueButtonEl.textContent = t('accessContinue');
  accessScreenButtonEl.textContent = t('accessButton');
  langToggleEl.textContent = currentLanguage.toUpperCase();
  strictToggleEl.textContent = strictMode ? t('strictOn') : t('strictOff');
  strictToggleEl.classList.toggle('off', !strictMode);
}

function showOnboardingError(message) {
  onboardingErrorEl.textContent = message;
  onboardingErrorEl.classList.remove('hidden');
}

function clearOnboardingError() {
  onboardingErrorEl.textContent = '';
  onboardingErrorEl.classList.add('hidden');
}

function ensureWelcomeMessage() {
  if (messagesEl.children.length === 0) {
    addMessage('assistant', t('welcome'));
  }
}

function initAccessState() {
  const creds = getStoredCredentials();
  onboardingKimiEl.value = creds.kimiApiKey;
  onboardingTvEl.value = creds.tradingviewSession;
  if (!hasValidCredentials()) {
    accessValidated = false;
    localStorage.setItem(storage.accessValidated, 'false');
  }
  if (accessValidated && hasValidCredentials()) {
    setView('chat');
    ensureWelcomeMessage();
  } else {
    setView('onboarding');
  }
}

langToggleEl.addEventListener('click', () => {
  currentLanguage = currentLanguage === 'fr' ? 'en' : 'fr';
  localStorage.setItem(storage.language, currentLanguage);
  applyLanguage();
});

strictToggleEl.addEventListener('click', () => {
  strictMode = !strictMode;
  localStorage.setItem(storage.strictMode, String(strictMode));
  applyLanguage();
});

accessScreenButtonEl.addEventListener('click', () => {
  const creds = getStoredCredentials();
  onboardingKimiEl.value = creds.kimiApiKey;
  onboardingTvEl.value = creds.tradingviewSession;
  clearOnboardingError();
  setView('onboarding');
});

onboardingFormEl.addEventListener('submit', (event) => {
  event.preventDefault();
  const kimiApiKey = onboardingKimiEl.value.trim();
  const tradingviewSession = onboardingTvEl.value.trim();
  if (!kimiApiKey || !tradingviewSession) {
    showOnboardingError(t('accessRequired'));
    return;
  }

  localStorage.setItem(storage.kimiApiKey, kimiApiKey);
  localStorage.setItem(storage.tvSession, tradingviewSession);
  localStorage.setItem(storage.accessValidated, 'true');
  accessValidated = true;
  clearOnboardingError();
  setView('chat');
  ensureWelcomeMessage();
});

formEl.addEventListener('submit', async (event) => {
  event.preventDefault();

  const message = inputEl.value.trim();
  const creds = getStoredCredentials();
  if (!creds.kimiApiKey || !creds.tradingviewSession || !accessValidated) {
    showOnboardingError(t('accessRequired'));
    setView('onboarding');
    return;
  }

  if (!message) {
    addMessage('error', t('emptyMessage'));
    return;
  }

  addMessage('user', message);
  inputEl.value = '';

  sendButton.disabled = true;
  sendButton.textContent = t('sending');
  const loadingNode = addLoadingMessage();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        kimiApiKey: creds.kimiApiKey,
        tradingviewSession: creds.tradingviewSession,
        lang: currentLanguage,
        strictMode
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      loadingNode.remove();
      addMessage('error', payload.error || t('serverError'));
      return;
    }

    loadingNode.remove();
    addMessage('assistant', cleanCoachText(payload.reply || t('emptyResponse')));
  } catch (error) {
    loadingNode.remove();
    addMessage('error', error?.message || t('networkError'));
  } finally {
    sendButton.disabled = false;
    sendButton.textContent = t('send');
  }
});

applyLanguage();
initAccessState();
