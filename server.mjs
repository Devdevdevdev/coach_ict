import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

function loadLocalEnvFile() {
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadLocalEnvFile();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const COACH_REFERENCE_PDF_PATH = join(process.cwd(), 'ICT-Trading-Strategy.pdf');
const COACH_REFERENCE_AVAILABLE = existsSync(COACH_REFERENCE_PDF_PATH);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function serveStatic(req, res) {
  const path = req.url === '/' ? '/index.html' : req.url;
  const safePath = path.includes('..') ? '/index.html' : path;
  const filePath = join(process.cwd(), 'public', safePath);
  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

async function callKimi({ apiKey, messages }) {
  const payload = {
    model: 'kimi-k2-0711-preview',
    temperature: 0.2,
    messages
  };

  const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kimi API error (${response.status}): ${text}`);
  }
  return response.json();
}

function normalizeInputSymbol(symbol) {
  const s = String(symbol || '').toUpperCase().trim();
  if (!s) return '';
  if (s.includes(':')) return s.split(':').pop() || s;
  return s;
}

function toYahooSymbols(symbol) {
  const s = normalizeInputSymbol(symbol);
  if (!s) return [];
  if (s === 'XAUUSD') return ['GC=F', 'XAUUSD=X'];
  if (s === 'XAGUSD') return ['SI=F', 'XAGUSD=X'];
  if (s === 'EURUSD') return ['EURUSD=X'];
  if (s === 'GBPUSD') return ['GBPUSD=X'];
  if (s === 'USDJPY') return ['USDJPY=X'];
  if (/^[A-Z]{3,6}USDT$/.test(s)) return [`${s.replace('USDT', '')}-USD`];
  return [s];
}

function timeframeToYahoo(tf) {
  const t = String(tf || '').toLowerCase();
  if (t === '1h') return { interval: '60m', range: '1mo' };
  if (t === '15m') return { interval: '15m', range: '7d' };
  if (t === '5m') return { interval: '5m', range: '5d' };
  if (t === '1d') return { interval: '1d', range: '6mo' };
  return { interval: '15m', range: '7d' };
}

async function fetchOHLC(symbol, timeframe, limit = 300) {
  const candidates = toYahooSymbols(symbol);
  if (candidates.length === 0) {
    return { ok: false, errorCode: 'INVALID_SYMBOL', message: 'symbol is required' };
  }
  const spec = timeframeToYahoo(timeframe);
  let lastError = { errorCode: 'MARKETDATA_EMPTY', message: 'No market data available' };

  for (const mapped of candidates) {
    const url =
      `${YAHOO_CHART_BASE}/${encodeURIComponent(mapped)}` +
      `?interval=${encodeURIComponent(spec.interval)}&range=${encodeURIComponent(spec.range)}`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'coach-ict/1.0' } });
      if (!res.ok) {
        lastError = { errorCode: 'MARKETDATA_HTTP_ERROR', message: `HTTP ${res.status} on ${mapped}` };
        continue;
      }

      const data = await res.json();
      const chartError = data?.chart?.error;
      if (chartError) {
        lastError = {
          errorCode: 'MARKETDATA_PROVIDER_ERROR',
          message: `${chartError?.code || 'ERROR'} on ${mapped}`
        };
        continue;
      }

      const result = data?.chart?.result?.[0];
      const timestamps = result?.timestamp || [];
      const quote = result?.indicators?.quote?.[0] || {};
      const candles = [];
      for (let i = 0; i < timestamps.length; i += 1) {
        const o = quote.open?.[i];
        const h = quote.high?.[i];
        const l = quote.low?.[i];
        const c = quote.close?.[i];
        if ([o, h, l, c].every((v) => Number.isFinite(v))) {
          candles.push({
            time: Number(timestamps[i]),
            open: Number(o),
            high: Number(h),
            low: Number(l),
            close: Number(c)
          });
        }
      }

      if (candles.length === 0) {
        lastError = { errorCode: 'MARKETDATA_EMPTY', message: `Empty candles on ${mapped}` };
        continue;
      }

      const sliced = candles.slice(-Math.max(10, limit));
      const last = sliced[sliced.length - 1] || null;
      return {
        ok: true,
        data: {
          symbol: normalizeInputSymbol(symbol),
          providerSymbol: mapped,
          timeframe: String(timeframe || '').toLowerCase(),
          candles: sliced,
          last
        }
      };
    } catch (error) {
      lastError = {
        errorCode: 'MARKETDATA_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Unknown market data error'
      };
    }
  }

  return {
    ok: false,
    errorCode: lastError.errorCode,
    message: lastError.message
  };
}

function parseUserIntent(message) {
  const text = String(message || '').toLowerCase();
  const upperText = String(message || '').toUpperCase();
  let requestedSymbol = null;
  let requestedTimeframe = null;

  if (/\bxauusd\b/.test(text) || /\bgold\b/.test(text) || /\bor\b/.test(text)) {
    requestedSymbol = 'XAUUSD';
  } else if (/\bxagusd\b/.test(text) || /\bsilver\b/.test(text)) {
    requestedSymbol = 'XAGUSD';
  } else if (/\beurusd\b/.test(text)) {
    requestedSymbol = 'EURUSD';
  } else if (/\bgbpusd\b/.test(text)) {
    requestedSymbol = 'GBPUSD';
  } else if (/\busdjpy\b/.test(text)) {
    requestedSymbol = 'USDJPY';
  } else if (/\bbtc(usdt)?\b/.test(text)) {
    requestedSymbol = 'BTCUSDT';
  } else if (/\beth(usdt)?\b/.test(text)) {
    requestedSymbol = 'ETHUSDT';
  } else {
    const explicit = upperText.match(/\b([A-Z]{3,10}:[A-Z0-9._-]+)\b/);
    if (explicit?.[1]) {
      requestedSymbol = explicit[1].split(':').pop() || explicit[1];
    } else {
      const generic = upperText.match(/\b([A-Z]{6}|[A-Z]{3,6}USDT)\b/);
      if (generic?.[1]) requestedSymbol = generic[1];
    }
  }

  const tfMatch = text.match(/\b(1m|3m|5m|15m|30m|45m|1h|2h|4h|1d|1w)\b/);
  if (tfMatch?.[1]) {
    requestedTimeframe = tfMatch[1];
  } else if (/\bm15\b/.test(text) || /\b15\s*min\b/.test(text) || /\b15\s*mn\b/.test(text)) {
    requestedTimeframe = '15m';
  }

  return { requestedSymbol, requestedTimeframe };
}

function ensureCoachSections(text, lang) {
  let out = String(text || '').trim();
  const sections =
    lang === 'en'
      ? [
          { marker: '⚠️ trap', fallback: '⚠️ trap\nAvoid entries without confirmation.' },
          { marker: '🎯 plan', fallback: '🎯 plan\nWait for a validated trigger, then execute with risk control.' },
          { marker: '💬 coaching', fallback: '💬 coaching\nDiscipline first: no trigger, no trade.' }
        ]
      : [
          { marker: '⚠️ piège', fallback: '⚠️ piège\nÉvite toute entrée sans confirmation.' },
          { marker: '🎯 plan', fallback: '🎯 plan\nAttends un trigger validé, puis exécute avec gestion du risque.' },
          { marker: '💬 coaching', fallback: '💬 coaching\nDiscipline avant tout: pas de trigger, pas de trade.' }
        ];

  for (const section of sections) {
    if (!out.toLowerCase().includes(section.marker.toLowerCase())) {
      out += `\n\n${section.fallback}`;
    }
  }
  return out;
}

async function runStrictICTCoach({ apiKey, userMessage, lang, requestedSymbol, strictMode }) {
  const symbol = requestedSymbol || 'XAUUSD';
  const tfList = ['1h', '15m', '5m'];
  const snapshots = {};
  const errors = [];

  for (const tf of tfList) {
    const snapshotResult = await fetchOHLC(symbol, tf, 300);
    if (snapshotResult?.ok === true && snapshotResult?.data) {
      snapshots[tf] = snapshotResult.data;
    } else {
      errors.push({
        timeframe: tf,
        errorCode: snapshotResult?.errorCode || 'SNAPSHOT_FAILED',
        message: snapshotResult?.message || 'Unknown snapshot error'
      });
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      error: {
        errorCode: 'STRICT_SNAPSHOTS_FAILED',
        message:
          lang === 'en'
            ? `Missing OHLC data for strict mode: ${JSON.stringify(errors)}`
            : `Données OHLC manquantes pour le mode strict: ${JSON.stringify(errors)}`
      }
    };
  }

  const responseFormat = strictMode
    ? lang === 'en'
      ? [
          'Output exactly with these sections and no extra ending question:',
          '1) 1H Bias',
          '2) 15M Setup',
          '3) 5M Entry Trigger',
          '4) Trade Plan (Entry, SL, TP, RR)',
          '5) Invalidations',
          '6) Coach Note (short and direct)'
        ].join('\n')
      : [
          'Réponds exactement avec ces sections et sans question finale:',
          '1) Biais 1H',
          '2) Setup 15M',
          '3) Trigger Entrée 5M',
          '4) Plan de Trade (Entrée, SL, TP, RR)',
          '5) Invalidations',
          '6) Note Coach (courte et directe)'
        ].join('\n')
    : lang === 'en'
      ? 'Provide a concise coaching analysis using 1H/15M/5M and a practical entry plan.'
      : 'Fais une analyse coaching concise en 1H/15M/5M avec un plan d’entrée pratique.';

  const coachReferenceLine = COACH_REFERENCE_AVAILABLE
    ? `Fichier de référence coach disponible localement: ${COACH_REFERENCE_PDF_PATH}.`
    : `Fichier de référence coach introuvable: ${COACH_REFERENCE_PDF_PATH}.`;

  const strictMessages = [
    {
      role: 'system',
      content:
        'Tu es Mon COACH ICT/SMC. Style: coach pro, direct, clair, orienté execution. ' +
        'Tu dois faire un vrai débrief ICT (orderblocks, FVG, liquidité, displacement, CHoCH/BOS si pertinent). ' +
        'Tu analyses la même paire en 1H/15M/5M, puis donnes un plan exécutable. ' +
        'Tu ne poses pas de question finale. Tu termines par une consigne d’action concrète. ' +
        'Si un niveau précis n’est pas confirmé, dis ATTENDRE au lieu d’inventer. ' +
        coachReferenceLine
    },
    {
      role: 'user',
      content:
        `Symbole demandé: ${symbol}\n` +
        `Demande utilisateur: ${userMessage}\n` +
        `OHLC vérifiés:\n${JSON.stringify(snapshots, null, 2)}\n\n` +
        `${responseFormat}\n` +
        (lang === 'en'
          ? 'Use markdown with short headings and bullet points. Mention explicit numeric levels only if justified by provided data.'
          : 'Utilise du markdown avec des titres courts et des points clairs. Donne des niveaux chiffrés seulement si justifiés par les données fournies.')
    }
  ];

  const completion = await callKimi({
    apiKey,
    messages: strictMessages
  });

  const assistant = String(completion?.choices?.[0]?.message?.content || '(No content)');
  return {
    ok: true,
    reply: assistant,
    snapshots,
    symbol
  };
}

async function handleChat(req, res) {
  try {
    const body = await parseJsonBody(req);
    const userMessage = String(body.message || '').trim();
    const lang = body.lang === 'en' ? 'en' : 'fr';
    const strictMode = body.strictMode !== false;
    const requestApiKey = String(body.kimiApiKey || '').trim();
    const apiKey = requestApiKey || String(process.env.KIMI_API_KEY || '').trim();

    if (!userMessage) {
      sendJson(res, 400, { error: lang === 'en' ? 'message is required' : 'message requis' });
      return;
    }

    if (!apiKey) {
      sendJson(res, 400, {
        error:
          lang === 'en'
            ? 'Kimi API key missing. Provide `kimiApiKey` in request or set KIMI_API_KEY env var.'
            : 'Clé API Kimi manquante. Fournis `kimiApiKey` dans la requête ou configure KIMI_API_KEY.'
      });
      return;
    }

    const intent = parseUserIntent(userMessage);
    if (!intent.requestedSymbol) {
      sendJson(res, 200, {
        reply:
          lang === 'en'
            ? 'Please select a symbol (XAUUSD, XAGUSD, EURUSD, GBPUSD, USDJPY) and run coach analysis.'
            : 'Sélectionne une paire (XAUUSD, XAGUSD, EURUSD, GBPUSD, USDJPY) puis lance l’analyse coach.',
        toolAware: false,
        strictMode
      });
      return;
    }

    const strict = await runStrictICTCoach({
      apiKey,
      userMessage,
      lang,
      requestedSymbol: intent.requestedSymbol,
      strictMode
    });

    if (!strict.ok) {
      sendJson(res, 200, {
        reply:
          lang === 'en'
            ? `Unable to run strict coach mode automatically. ${strict.error.message}`
            : `Impossible d'exécuter automatiquement le mode coach strict. ${strict.error.message}`,
        toolAware: false,
        strictMode,
        strictError: strict.error
      });
      return;
    }

    sendJson(res, 200, {
      reply: ensureCoachSections(strict.reply, lang),
      toolAware: false,
      strictMode,
      strictSnapshots: strict.snapshots,
      symbol: strict.symbol
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Unknown server error'
    });
  }
}

const server = createServer(async (req, res) => {
  if (!req.url || !req.method) {
    sendJson(res, 400, { error: 'Bad request' });
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/ohlc')) {
    try {
      const url = new URL(req.url, `http://${HOST}:${PORT}`);
      const symbol = String(url.searchParams.get('symbol') || '').trim();
      const timeframe = String(url.searchParams.get('tf') || '15m').trim().toLowerCase();
      const limit = Number(url.searchParams.get('limit') || 300);
      const result = await fetchOHLC(symbol, timeframe, Number.isFinite(limit) ? limit : 300);
      sendJson(res, result.ok ? 200 : 400, result);
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        errorCode: 'OHLC_ENDPOINT_FAILED',
        message: error instanceof Error ? error.message : 'Unknown ohlc endpoint error'
      });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    await handleChat(req, res);
    return;
  }

  if (req.method === 'GET') {
    await serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
});

server.listen(PORT, HOST, () => {
  console.log(`\n✅ COACH ICT Server running at http://${HOST}:${PORT}`);
  console.log(`📈 Market data endpoint: ${YAHOO_CHART_BASE}`);
  console.log(`\n🚀 Usage:`);
  console.log(`   1. Open http://${HOST}:${PORT} in your browser`);
  console.log(`   2. Enter your Kimi API key and click "Accès"`);
  console.log(`   3. Select a symbol and click "Lancer Coach IA"\n`);
});
