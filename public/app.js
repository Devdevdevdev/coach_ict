const onboardingViewEl = document.getElementById('onboardingView');
const chatViewEl = document.getElementById('chatView');
const onboardingFormEl = document.getElementById('onboardingForm');
const onboardingErrorEl = document.getElementById('onboardingError');
const onboardingKimiEl = document.getElementById('onboardingKimiApiKey');
const accessContinueButtonEl = document.getElementById('accessContinueButton');
const accessScreenButtonEl = document.getElementById('accessScreenButton');

const messagesEl = document.getElementById('messages');
const langToggleEl = document.getElementById('langToggle');
const runCoachButtonEl = document.getElementById('runCoachButton');
const symbolSelectEl = document.getElementById('symbolSelect');
const symbolSelectLabelEl = document.getElementById('symbolSelectLabel');

const ui = {
  appTitle: document.getElementById('appTitle'),
  appSubtitle: document.getElementById('appSubtitle'),
  accessTitle: document.getElementById('accessTitle'),
  accessSubtle: document.getElementById('accessSubtle'),
  kimiLabel: document.getElementById('kimiLabel'),
  accessHint: document.getElementById('accessHint'),
  assistantTitle: document.getElementById('assistantTitle')
};

const storage = {
  kimiApiKey: 'coach_ict_kimi_api_key',
  language: 'coach_ict_language',
  accessValidated: 'coach_ict_access_validated'
};

const dictionary = {
  fr: {
    appTitle: 'COACH ICT',
    appSubtitle: "Mon coach ICT/SMC: analyse multi-timeframe et points d'entrée précis.",
    accessTitle: 'Accès utilisateur',
    accessSubtle: 'Renseigne tes accès une fois, puis passe au coaching.',
    kimiLabel: 'Clé API Kimi',
    accessHint: "Aucune clé n'est commitée. La clé Kimi est obligatoire.",
    assistantTitle: 'Mon COACH ICT',
    symbolSelectLabel: 'Paire à analyser',
    loading: 'Analyse ICT en cours...',
    serverError: 'Erreur serveur',
    networkError: 'Erreur réseau',
    emptyResponse: '(réponse vide)',
    runCoach: 'Lancer Coach IA',
    runningCoach: 'Analyse...',
    accessButton: 'Accès',
    accessContinue: 'Valider les accès',
    accessRequired: 'La clé Kimi est requise.',
    welcome: 'COACH ICT prêt. Indique seulement la paire/symbole à analyser (ex: XAUUSD).'
  },
  en: {
    appTitle: 'COACH ICT',
    appSubtitle: 'My ICT/SMC coach: multi-timeframe analysis and precise entries.',
    accessTitle: 'User Access',
    accessSubtle: 'Set your credentials once, then move to coaching.',
    kimiLabel: 'Kimi API Key',
    accessHint: 'No key is committed. Kimi key is required.',
    assistantTitle: 'My ICT COACH',
    symbolSelectLabel: 'Pair to analyze',
    loading: 'ICT analysis in progress...',
    serverError: 'Server error',
    networkError: 'Network error',
    emptyResponse: '(empty response)',
    runCoach: 'Run AI Coach',
    runningCoach: 'Analyzing...',
    accessButton: 'Access',
    accessContinue: 'Validate access',
    accessRequired: 'Kimi key is required.',
    welcome: 'COACH ICT ready. Enter only the symbol/pair to analyze (ex: XAUUSD).'
  }
};

let currentLanguage = localStorage.getItem(storage.language) === 'en' ? 'en' : 'fr';
const strictMode = true;
let accessValidated = localStorage.getItem(storage.accessValidated) === 'true';

function getStoredCredentials() {
  return {
    kimiApiKey: (localStorage.getItem(storage.kimiApiKey) || '').trim()
  };
}

function hasValidCredentials() {
  const creds = getStoredCredentials();
  return Boolean(creds.kimiApiKey);
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
  ui.accessHint.textContent = t('accessHint');
  ui.assistantTitle.textContent = t('assistantTitle');
  symbolSelectLabelEl.textContent = t('symbolSelectLabel');
  accessContinueButtonEl.textContent = t('accessContinue');
  accessScreenButtonEl.textContent = t('accessButton');
  langToggleEl.textContent = currentLanguage.toUpperCase();
  runCoachButtonEl.textContent = t('runCoach');
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

accessScreenButtonEl.addEventListener('click', () => {
  const creds = getStoredCredentials();
  onboardingKimiEl.value = creds.kimiApiKey;
  clearOnboardingError();
  setView('onboarding');
});

onboardingFormEl.addEventListener('submit', (event) => {
  event.preventDefault();
  const kimiApiKey = onboardingKimiEl.value.trim();
  if (!kimiApiKey) {
    showOnboardingError(t('accessRequired'));
    return;
  }

  localStorage.setItem(storage.kimiApiKey, kimiApiKey);
  localStorage.setItem(storage.accessValidated, 'true');
  accessValidated = true;
  clearOnboardingError();
  setView('chat');
  ensureWelcomeMessage();
});

async function submitCoachMessage(message) {
  const creds = getStoredCredentials();
  if (!creds.kimiApiKey || !accessValidated) {
    showOnboardingError(t('accessRequired'));
    setView('onboarding');
    return;
  }

  addMessage('user', message);

  runCoachButtonEl.disabled = true;
  runCoachButtonEl.textContent = t('runningCoach');

  const loadingNode = addLoadingMessage();
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        kimiApiKey: creds.kimiApiKey,
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
    runCoachButtonEl.disabled = false;
    runCoachButtonEl.textContent = t('runCoach');
  }
}

runCoachButtonEl.addEventListener('click', async () => {
  const symbol = symbolSelectEl.value;
  await submitCoachMessage(symbol);
});

applyLanguage();
initAccessState();
