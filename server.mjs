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
const TRADINGVIEW_BRIDGE_URL = String(process.env.TRADINGVIEW_BRIDGE_URL || '').trim();
const COACH_REFERENCE_PDF_PATH = join(process.cwd(), 'ICT-Trading-Strategy.pdf');
const COACH_REFERENCE_AVAILABLE = existsSync(COACH_REFERENCE_PDF_PATH);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'get_chart_snapshot',
      description: 'Get current chart/symbol state from TradingView connector',
      parameters: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: 'Target symbol, e.g. OANDA:XAUUSD or BINANCE:BTCUSDT'
          },
          timeframe: {
            type: 'string',
            description: 'Preferred timeframe like 1m, 5m, 15m, 1h, 1D'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_symbol',
      description: 'Change chart symbol in TradingView connector',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Ticker/symbol, e.g. OANDA:XAUUSD' },
          timeframe: { type: 'string', description: 'Optional timeframe like 5m, 15m, 1h, 1d' }
        },
        required: ['symbol']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_backtest',
      description: 'Run strategy backtest through TradingView bridge',
      parameters: {
        type: 'object',
        properties: {
          idea: { type: 'string', description: 'Strategy idea to test' }
        },
        required: ['idea']
      }
    }
  }
];

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

async function callKimi({ apiKey, messages, tools }) {
  const payload = {
    model: 'kimi-k2-0711-preview',
    temperature: 0.2,
    messages
  };
  if (tools) payload.tools = tools;

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

async function runStrictICTCoach({
  apiKey,
  userMessage,
  tradingviewSession,
  lang,
  requestedSymbol
}) {
  const symbol = requestedSymbol || 'XAUUSD';
  const tfList = ['1h', '15m', '5m'];
  const snapshots = {};
  const errors = [];

  for (const tf of tfList) {
    await tradingViewToolExecutor({
      toolName: 'set_symbol',
      args: { symbol, timeframe: tf },
      tradingviewSession
    });

    const snapshotResult = await tradingViewToolExecutor({
      toolName: 'get_chart_snapshot',
      args: { symbol, timeframe: tf },
      tradingviewSession
    });

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
            ? `Missing snapshots for strict mode: ${JSON.stringify(errors)}`
            : `Snapshots manquants pour le mode strict: ${JSON.stringify(errors)}`
      }
    };
  }

  const responseFormat =
    lang === 'en'
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
        ].join('\n');

  const strictMessages = [
    {
      role: 'system',
      content:
        'Tu es Mon COACH ICT/SMC. Style: coach pro, direct, clair, orienté execution. ' +
        'Tu dois faire un vrai débrief ICT (orderblocks, FVG, liquidité, displacement, CHoCH/BOS si pertinent). ' +
        'Tu analyses la meme paire en 1H/15M/5M, puis donnes un plan executable. ' +
        'Tu ne poses pas de question finale. Tu termines par une consigne d action concrete. ' +
        'Si un niveau précis n est pas confirmé, dis ATTENDRE au lieu d inventer.'
    },
    {
      role: 'user',
      content:
        `Symbole demande: ${symbol}\n` +
        `Demande utilisateur: ${userMessage}\n` +
        `Snapshots verifies:\n${JSON.stringify(snapshots, null, 2)}\n\n` +
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
    snapshots
  };
}

async function callTradingViewBridge({ toolName, args, tradingviewSession }) {
  if (!TRADINGVIEW_BRIDGE_URL) {
    return {
      ok: false,
      source: 'tradingview-live',
      errorCode: 'CONNECTOR_NOT_CONFIGURED',
      message:
        'No live TradingView connector is configured. Set TRADINGVIEW_BRIDGE_URL to enable real market data.'
    };
  }

  const response = await fetch(`${TRADINGVIEW_BRIDGE_URL.replace(/\/$/, '')}/tool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toolName,
      args,
      tradingviewSession
    })
  });

  if (!response.ok) {
    const text = await response.text();
    return {
      ok: false,
      source: 'tradingview-live',
      errorCode: 'CONNECTOR_HTTP_ERROR',
      message: `TradingView connector error (${response.status}): ${text}`
    };
  }

  const payload = await response.json();
  return {
    source: 'tradingview-live',
    ...payload
  };
}

async function tradingViewToolExecutor({ toolName, args, tradingviewSession }) {
  if (!['get_chart_snapshot', 'set_symbol', 'run_backtest'].includes(toolName)) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  return callTradingViewBridge({ toolName, args, tradingviewSession });
}

function parseUserIntent(message) {
  const text = String(message || '').toLowerCase();
  const upperText = String(message || '').toUpperCase();
  let requestedSymbol = null;
  let requestedTimeframe = null;

  if (/\bxauusd\b/.test(text) || /\bgold\b/.test(text) || /\bor\b/.test(text)) {
    requestedSymbol = 'XAUUSD';
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

function normalizeSymbol(rawSymbol) {
  const cleaned = String(rawSymbol || '').toUpperCase().trim();
  if (!cleaned) return '';
  if (cleaned.includes(':')) return cleaned.split(':').pop() || cleaned;
  return cleaned;
}

function normalizeTimeframe(rawTf) {
  const cleaned = String(rawTf || '').toLowerCase().replace(/\s+/g, '');
  if (!cleaned) return '';
  if (cleaned === '15min' || cleaned === '15minutes') return '15m';
  return cleaned;
}

function looksLikeSymbolOnlyInput(text) {
  return /^\s*([A-Za-z]{3,10}:[A-Za-z0-9._-]+|[A-Za-z]{6}|[A-Za-z]{3,6}USDT)\s*$/i.test(String(text || ''));
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

async function runAgentLoop({ apiKey, userMessage, tradingviewSession, lang, strictMode }) {
  let hasTrustedMarketData = false;
  let lastSnapshot = null;
  let lastSnapshotError = null;
  let lastSnapshotErrorMessage = null;
  const replyLanguage = lang === 'en' ? 'English' : 'French';
  const coachPrompt =
    "Tu es un expert ICT/SMC (Mon COACH) connaissant les grands concepts de base comme orderblocks, FVG, " +
    "prises de liquidité sur les supports/résistances. " +
    'Tu analyseras toujours la même paire/devise sur 3 timeframes: 1H, 15M et 5M selon la demande utilisateur. ' +
    "Ton objectif est de débriefer la tendance générale du marché et de donner les meilleurs points d'entrée en 5 minutes " +
    'en expliquant tes décisions. Si possible, indique SL, TP et RR le plus précisément possible. ' +
    'Reste strictement factuel: aucune donnée inventée.';
  const coachReferenceLine = COACH_REFERENCE_AVAILABLE
    ? `Fichier de référence coach disponible localement: ${COACH_REFERENCE_PDF_PATH}.`
    : `Fichier de référence coach introuvable: ${COACH_REFERENCE_PDF_PATH}.`;
  const strictStructure =
    lang === 'en'
      ? 'Response format must strictly be: 1) 1H Bias 2) 15M Setup 3) 5M Entry 4) SL/TP/RR 5) Invalidations.'
      : 'Le format de réponse doit être strictement: 1) Biais 1H 2) Setup 15M 3) Entrée 5M 4) SL/TP/RR 5) Invalidations.';
  const effectiveUserMessage = looksLikeSymbolOnlyInput(userMessage)
    ? `${userMessage}\nAnalyse automatiquement cette paire sur 1H, 15M et 5M.`
    : userMessage;

  const messages = [
    {
      role: 'system',
      content:
        `${coachPrompt} Use tools whenever chart state/symbol/timeframe is needed. ` +
        'Before any numeric entry/SL/TP, call get_chart_snapshot for requested symbol/timeframe. ' +
        'If tools are unavailable or untrusted, refuse numeric levels and explain why. ' +
        `${coachReferenceLine} ${strictMode ? strictStructure : ''} Respond in ${replyLanguage}.`
    },
    { role: 'user', content: effectiveUserMessage }
  ];

  for (let step = 0; step < 6; step += 1) {
    const completion = await callKimi({
      apiKey,
      messages,
      tools: TOOL_SCHEMAS
    });

    const choice = completion.choices?.[0]?.message;
    if (!choice) {
      throw new Error('Invalid Kimi response: missing choice message');
    }

    messages.push(choice);

    const toolCalls = choice.tool_calls || [];
    if (toolCalls.length === 0) {
      return {
        assistant: String(choice.content || '(No content)'),
        trace: messages,
        hasTrustedMarketData,
        lastSnapshot,
        lastSnapshotError,
        lastSnapshotErrorMessage
      };
    }

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function?.name;
      const rawArgs = toolCall.function?.arguments || '{}';
      let args;
      try {
        args = JSON.parse(rawArgs);
      } catch {
        args = {};
      }

      const toolResult = await tradingViewToolExecutor({
        toolName,
        args,
        tradingviewSession
      });

      if (toolName === 'get_chart_snapshot' && toolResult?.ok === true && toolResult?.source === 'tradingview-live') {
        hasTrustedMarketData = true;
        lastSnapshot = toolResult?.data || null;
      } else if (toolName === 'get_chart_snapshot' && toolResult?.ok === false) {
        lastSnapshotError = toolResult?.errorCode || 'SNAPSHOT_FAILED';
        lastSnapshotErrorMessage = toolResult?.message || null;
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult)
      });
    }
  }

  throw new Error('Agent loop exceeded max steps');
}

async function handleChat(req, res) {
  try {
    const body = await parseJsonBody(req);
    const userMessage = String(body.message || '').trim();
    const lang = body.lang === 'en' ? 'en' : 'fr';
    const strictMode = body.strictMode !== false;
    const requestApiKey = String(body.kimiApiKey || '').trim();
    const tradingviewSession = String(body.tradingviewSession || '').trim();
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
    if (strictMode && intent.requestedSymbol) {
      const strict = await runStrictICTCoach({
        apiKey,
        userMessage,
        tradingviewSession,
        lang,
        requestedSymbol: intent.requestedSymbol
      });
      if (!strict.ok) {
        sendJson(res, 200, {
          reply:
            lang === 'en'
              ? `Unable to run strict coach mode automatically. ${strict.error.message}`
              : `Impossible d'executer automatiquement le mode coach strict. ${strict.error.message}`,
          toolAware: true,
          strictMode,
          strictAuto: true,
          strictError: strict.error
        });
        return;
      }

      sendJson(res, 200, {
        reply: ensureCoachSections(strict.reply, lang),
        toolAware: true,
        strictMode,
        strictAuto: true,
        strictSnapshots: strict.snapshots
      });
      return;
    }

    const result = await runAgentLoop({
      apiKey,
      userMessage,
      tradingviewSession,
      lang,
      strictMode
    });
    const snapshotSymbol = normalizeSymbol(result.lastSnapshot?.symbol);
    const snapshotTf = normalizeTimeframe(result.lastSnapshot?.timeframe);
    const symbolMatches = intent.requestedSymbol ? snapshotSymbol.includes(intent.requestedSymbol) : true;
    const timeframeMatches = intent.requestedTimeframe ? snapshotTf === intent.requestedTimeframe : true;
    const dataAligned = Boolean(result.hasTrustedMarketData && symbolMatches && timeframeMatches);
    const connectorConfigured = Boolean(TRADINGVIEW_BRIDGE_URL);

    const containsTradeIntent =
      /(analyse|analysis|entry|entrée|sl|tp|xau|gold|or|btc|eth|signal|setup|15m|15min)/i.test(userMessage);

    const reply =
      containsTradeIntent && !dataAligned
        ? lang === 'en'
          ? `Unable to provide reliable numeric analysis. Cause: ${
              !connectorConfigured
                ? 'TRADINGVIEW_BRIDGE_URL is not configured.'
                : result.lastSnapshotError || 'missing or mismatched live snapshot'
            }${result.lastSnapshotErrorMessage ? ` Detail: ${result.lastSnapshotErrorMessage}.` : ''} Requested: ${intent.requestedSymbol || 'N/A'} ${intent.requestedTimeframe || 'N/A'} | Received: ${snapshotSymbol || 'N/A'} ${snapshotTf || 'N/A'}.`
          : `Impossible de fournir une analyse chiffrée fiable. Cause: ${
              !connectorConfigured
                ? 'TRADINGVIEW_BRIDGE_URL non configuré.'
                : result.lastSnapshotError || 'snapshot live absent ou non aligné'
            }${result.lastSnapshotErrorMessage ? ` Détail: ${result.lastSnapshotErrorMessage}.` : ''} Demandé: ${intent.requestedSymbol || 'N/A'} ${intent.requestedTimeframe || 'N/A'} | Reçu: ${snapshotSymbol || 'N/A'} ${snapshotTf || 'N/A'}.`
        : result.assistant;

    sendJson(res, 200, {
      reply: containsTradeIntent ? ensureCoachSections(reply, lang) : reply,
      toolAware: true,
      trustedMarketData: result.hasTrustedMarketData,
      dataAligned,
      connectorConfigured,
      intent,
      snapshot: result.lastSnapshot,
      snapshotError: result.lastSnapshotError,
      snapshotErrorMessage: result.lastSnapshotErrorMessage,
      strictMode,
      traceLength: result.trace.length
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
  console.log(`Server running at http://${HOST}:${PORT}`);
});
