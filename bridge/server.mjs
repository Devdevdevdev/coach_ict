import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

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
    if (value.startsWith('$HOME/')) {
      value = `${process.env.HOME || ''}${value.slice('$HOME'.length)}`;
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadLocalEnvFile();

const BRIDGE_PORT = Number(process.env.BRIDGE_PORT || 8787);
const BRIDGE_HOST = process.env.BRIDGE_HOST || '127.0.0.1';
const CHROME_DEBUG_URL = (process.env.CHROME_DEBUG_URL || 'http://127.0.0.1:9222').replace(/\/$/, '');
const TV_TAB_MATCH = process.env.TV_TAB_MATCH || 'tradingview.com';
const TV_AUTO_URL = process.env.TV_AUTO_URL || 'https://fr.tradingview.com/chart/?symbol=VANTAGE%3AXAUUSD';
const AUTO_START_CHROME = String(process.env.AUTO_START_CHROME || 'true').toLowerCase() === 'true';
const CHROME_PATH =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME_USER_DATA_DIR = process.env.CHROME_USER_DATA_DIR || `${process.env.HOME || '/tmp'}/.chrome-tv-debug`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response.json();
}

async function openNewTarget(urlToOpen) {
  const response = await fetch(`${CHROME_DEBUG_URL}/json/new?${encodeURIComponent(urlToOpen)}`, {
    method: 'PUT'
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response.json();
}

async function isChromeDebugReady() {
  try {
    await fetchJson(`${CHROME_DEBUG_URL}/json/version`);
    return true;
  } catch {
    return false;
  }
}

function spawnChromeDebug() {
  const url = new URL(CHROME_DEBUG_URL);
  const port = url.port || '9222';
  const host = url.hostname || '127.0.0.1';
  const args = [
    `--remote-debugging-address=${host}`,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${CHROME_USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    TV_AUTO_URL
  ];
  const child = spawn(CHROME_PATH, args, {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
}

async function ensureChromeDebug() {
  if (await isChromeDebugReady()) return;
  if (!AUTO_START_CHROME) {
    throw new Error('Chrome debug endpoint unavailable and AUTO_START_CHROME=false');
  }
  spawnChromeDebug();
  for (let i = 0; i < 20; i += 1) {
    await sleep(400);
    if (await isChromeDebugReady()) return;
  }
  throw new Error(`Chrome debug endpoint not reachable at ${CHROME_DEBUG_URL}`);
}

function normalizeTimeframe(tf) {
  const cleaned = String(tf || '').toLowerCase().replace(/\s+/g, '');
  if (!cleaned) return '';
  if (cleaned === '15min' || cleaned === 'm15' || cleaned === '15minutes') return '15m';
  return cleaned;
}

function timeframeToInterval(tf) {
  const t = normalizeTimeframe(tf);
  if (t === '1m') return '1';
  if (t === '3m') return '3';
  if (t === '5m') return '5';
  if (t === '15m') return '15';
  if (t === '30m') return '30';
  if (t === '45m') return '45';
  if (t === '1h') return '60';
  if (t === '2h') return '120';
  if (t === '4h') return '240';
  if (t === '1d') return 'D';
  if (t === '1w') return 'W';
  return '';
}

function normalizeSymbol(symbol) {
  const cleaned = String(symbol || '').toUpperCase().trim();
  if (!cleaned) return '';
  if (cleaned.includes(':')) return cleaned.split(':').pop() || cleaned;
  return cleaned;
}

function buildTradingViewUrl({ symbol, timeframe }) {
  const normalized = normalizeSymbol(symbol || 'XAUUSD');
  const tvSymbol = normalized.includes(':') ? normalized : `VANTAGE:${normalized}`;
  const interval = timeframeToInterval(timeframe) || '15';
  const url = new URL('https://fr.tradingview.com/chart/');
  url.searchParams.set('symbol', tvSymbol);
  url.searchParams.set('interval', interval);
  return url.toString();
}

function parseTargetInfo(targetUrl) {
  try {
    const u = new URL(targetUrl);
    const symbol = normalizeSymbol(u.searchParams.get('symbol') || '');
    const timeframe = normalizeTimeframe(u.searchParams.get('interval') || '');
    return { symbol, timeframe };
  } catch {
    return { symbol: '', timeframe: '' };
  }
}

async function pickTradingViewTarget(tabIdHint, requestedSymbol, requestedTimeframe) {
  await ensureChromeDebug();
  const list = await fetchJson(`${CHROME_DEBUG_URL}/json/list`);
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('No debuggable Chrome targets found');
  }

  if (tabIdHint) {
    const hinted = list.find((t) => String(t.id) === String(tabIdHint) && t.webSocketDebuggerUrl);
    if (hinted) return hinted;
  }

  const candidates = list.filter(
    (target) =>
      target.type === 'page' &&
      target.webSocketDebuggerUrl &&
      `${target.url || ''} ${target.title || ''}`.toLowerCase().includes(TV_TAB_MATCH.toLowerCase())
  );

  const strict = candidates.find((target) => {
    const info = parseTargetInfo(target.url || '');
    const symbolOk = requestedSymbol ? info.symbol.includes(requestedSymbol) : true;
    const timeframeOk = requestedTimeframe ? info.timeframe === normalizeTimeframe(requestedTimeframe) : true;
    return symbolOk && timeframeOk;
  });
  if (strict) return strict;

  const symbolOnly = candidates.find((target) => {
    const info = parseTargetInfo(target.url || '');
    return requestedSymbol ? info.symbol.includes(requestedSymbol) : true;
  });
  if (symbolOnly) return symbolOnly;

  const tv = candidates[0];

  if (!tv) {
    const autoUrl = buildTradingViewUrl({
      symbol: requestedSymbol || 'XAUUSD',
      timeframe: requestedTimeframe || '15m'
    });
    try {
      await openNewTarget(autoUrl);
      await sleep(700);
      const refreshed = await fetchJson(`${CHROME_DEBUG_URL}/json/list`);
      const opened = refreshed.find(
        (target) =>
          target.type === 'page' &&
          target.webSocketDebuggerUrl &&
          `${target.url || ''} ${target.title || ''}`.toLowerCase().includes(TV_TAB_MATCH.toLowerCase())
      );
      if (opened) return opened;
    } catch {
      // fall through to final error
    }
    throw new Error(`No TradingView tab found (match: "${TV_TAB_MATCH}")`);
  }
  return tv;
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });
    this.ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!msg.id) return;
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error.message || 'CDP error'));
      else pending.resolve(msg.result);
    });
  }

  async call(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    const payload = { id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload), (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // ignore close errors
    }
  }
}

function buildSnapshotScript(requestedSymbol, requestedTimeframe) {
  const reqSymbol = String(requestedSymbol || '');
  const reqTf = String(requestedTimeframe || '');
  return `
(() => {
  const q = new URL(location.href).searchParams;
  const byUrl = q.get('symbol') || '';
  const byInterval = q.get('interval') || '';
  const byTitle = (document.title || '').toUpperCase();
  const docText = (document.body?.innerText || '').slice(0, 50000);
  const extractSymbol = (txt) => {
    const t = String(txt || '').toUpperCase();
    const explicit = t.match(/\\b([A-Z]+:[A-Z0-9._-]+)\\b/);
    if (explicit && explicit[1]) return explicit[1];
    const majors = t.match(/\\b(XAUUSD|XAGUSD|BTCUSDT|ETHUSDT|EURUSD|GBPUSD|USDJPY)\\b/);
    if (majors && majors[1]) return majors[1];
    return '';
  };
  const extractTf = (txt) => {
    const t = String(txt || '').toLowerCase();
    if (t === '1') return '1m';
    if (t === '3') return '3m';
    if (t === '5') return '5m';
    if (t === '15') return '15m';
    if (t === '30') return '30m';
    if (t === '45') return '45m';
    if (t === '60') return '1h';
    if (t === '120') return '2h';
    if (t === '240') return '4h';
    if (t === 'd' || t === '1d') return '1d';
    if (t === 'w' || t === '1w') return '1w';
    const m = t.match(/\\b(1m|3m|5m|15m|30m|45m|1h|2h|4h|1d|1w)\\b/);
    if (m && m[1]) return m[1];
    if (/\\bm15\\b/.test(t) || /\\b15\\s*min\\b/.test(t) || /\\b15\\s*mn\\b/.test(t)) return '15m';
    return '';
  };

  const candidates = [];
  if (byUrl) candidates.push(byUrl);
  candidates.push(byTitle);
  candidates.push(docText);
  const symbol = candidates.map(extractSymbol).find(Boolean) || '';
  let timeframe = '';
  const activeButtons = Array.from(document.querySelectorAll('button,[role="button"]'))
    .filter((el) =>
      el.getAttribute('aria-pressed') === 'true' ||
      el.getAttribute('aria-selected') === 'true' ||
      el.className.includes('isActive') ||
      el.className.includes('selected')
    )
    .map((el) => el.textContent || '');
  timeframe =
    activeButtons.map(extractTf).find(Boolean) ||
    extractTf(byInterval) ||
    extractTf(byTitle) ||
    extractTf(docText);

  const numberText = (docText.match(/\\b\\d{1,3}(?:[ ,]\\d{3})*(?:[.,]\\d+)?\\b/g) || []).slice(0, 200);
  let lastPrice = null;
  for (const token of numberText) {
    const n = Number(token.replace(/ /g, '').replace(',', '.'));
    if (Number.isFinite(n) && n > 0) {
      if (symbol.includes('XAUUSD') && n > 1000 && n < 10000) { lastPrice = n; break; }
      if (symbol.includes('BTCUSDT') && n > 1000) { lastPrice = n; break; }
      if (symbol.includes('ETHUSDT') && n > 100) { lastPrice = n; break; }
    }
  }

  return {
    symbol,
    timeframe,
    lastPrice,
    requestedSymbol: ${JSON.stringify(reqSymbol)},
    requestedTimeframe: ${JSON.stringify(reqTf)},
    chartUrl: location.href,
    pageTitle: document.title,
    extractedAt: new Date().toISOString()
  };
})()
`;
}

async function withTargetEval({ tabIdHint, expression }) {
  const target = await pickTradingViewTarget(tabIdHint);
  const client = new CDPClient(target.webSocketDebuggerUrl);
  try {
    await client.call('Runtime.enable');
    const result = await client.call('Runtime.evaluate', {
      expression,
      returnByValue: true
    });
    return {
      targetId: target.id,
      targetTitle: target.title,
      targetUrl: target.url,
      value: result?.result?.value
    };
  } finally {
    client.close();
  }
}

async function withRequestedTargetEval({ tabIdHint, expression, requestedSymbol, requestedTimeframe }) {
  const target = await pickTradingViewTarget(tabIdHint, requestedSymbol, requestedTimeframe);
  const client = new CDPClient(target.webSocketDebuggerUrl);
  try {
    await client.call('Runtime.enable');
    const result = await client.call('Runtime.evaluate', {
      expression,
      returnByValue: true
    });
    return {
      targetId: target.id,
      targetTitle: target.title,
      targetUrl: target.url,
      value: result?.result?.value
    };
  } finally {
    client.close();
  }
}

async function getChartSnapshot({ args, tradingviewSession }) {
  const requestedSymbol = normalizeSymbol(args?.symbol || '');
  const requestedTimeframe = normalizeTimeframe(args?.timeframe || '');
  const tabIdHint = String(tradingviewSession || '').trim();

  try {
    const expression = buildSnapshotScript(requestedSymbol, requestedTimeframe);
    let out = null;
    let symbol = '';
    let timeframe = '';
    let lastPrice = null;
    let extractedAt = new Date().toISOString();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      out = await withRequestedTargetEval({
        tabIdHint,
        expression,
        requestedSymbol,
        requestedTimeframe
      });
      const value = out?.value || {};
      symbol = normalizeSymbol(value.symbol || '');
      timeframe = normalizeTimeframe(value.timeframe || '');
      lastPrice = value.lastPrice ?? null;
      extractedAt = value.extractedAt || new Date().toISOString();

      const symbolOk = requestedSymbol ? symbol.includes(requestedSymbol) : Boolean(symbol);
      const timeframeOk = requestedTimeframe ? timeframe === requestedTimeframe : Boolean(timeframe);
      if (symbolOk && timeframeOk) break;

      if (requestedSymbol && requestedTimeframe && attempt === 2) {
        const forcedUrl = buildTradingViewUrl({ symbol: requestedSymbol, timeframe: requestedTimeframe });
        await openNewTarget(forcedUrl);
      }
      await sleep(500);
    }

    return {
      ok: true,
      data: {
        symbol,
        timeframe,
        lastPrice,
        extractedAt,
        source: {
          targetId: out?.targetId || null,
          targetTitle: out?.targetTitle || null,
          targetUrl: out?.targetUrl || null
        }
      },
      meta: {
        requestedSymbol,
        requestedTimeframe,
        symbolAligned: requestedSymbol ? symbol.includes(requestedSymbol) : true,
        timeframeAligned: requestedTimeframe ? timeframe === requestedTimeframe : true
      }
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: 'SNAPSHOT_FAILED',
      message: error instanceof Error ? error.message : 'Unknown snapshot error'
    };
  }
}

async function setSymbol(args) {
  try {
    const symbol = normalizeSymbol(args?.symbol || '');
    const timeframe = normalizeTimeframe(args?.timeframe || '15m');
    if (!symbol) {
      return {
        ok: false,
        errorCode: 'SET_SYMBOL_INVALID',
        message: 'symbol is required'
      };
    }

    await ensureChromeDebug();
    const target = await pickTradingViewTarget(null, symbol, timeframe);
    const chartUrl = buildTradingViewUrl({ symbol, timeframe });
    const client = new CDPClient(target.webSocketDebuggerUrl);
    try {
      await client.call('Page.enable');
      await client.call('Page.navigate', { url: chartUrl });
      await sleep(900);
    } finally {
      client.close();
    }

    return {
      ok: true,
      data: {
        symbol,
        timeframe,
        chartUrl
      }
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: 'SET_SYMBOL_FAILED',
      message: error instanceof Error ? error.message : 'Unknown set_symbol error'
    };
  }
}

async function runBacktest() {
  return {
    ok: false,
    errorCode: 'BACKTEST_UNSUPPORTED',
    message: 'run_backtest is not implemented in this lightweight bridge.'
  };
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    const chromeDebugReady = await isChromeDebugReady();
    sendJson(res, 200, {
      ok: true,
      bridge: 'tradingview-cdp-bridge',
      chromeDebugUrl: CHROME_DEBUG_URL,
      tabMatch: TV_TAB_MATCH,
      autoStartChrome: AUTO_START_CHROME,
      chromePath: CHROME_PATH,
      chromeDebugReady
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/tool') {
    try {
      const body = await parseJsonBody(req);
      const toolName = String(body.toolName || '').trim();
      const args = body.args || {};
      const tradingviewSession = body.tradingviewSession;

      if (toolName === 'get_chart_snapshot') {
        const result = await getChartSnapshot({ args, tradingviewSession });
        sendJson(res, 200, result);
        return;
      }

      if (toolName === 'set_symbol') {
        sendJson(res, 200, await setSymbol(args));
        return;
      }

      if (toolName === 'run_backtest') {
        sendJson(res, 200, await runBacktest(args));
        return;
      }

      sendJson(res, 400, {
        ok: false,
        errorCode: 'UNKNOWN_TOOL',
        message: `Unknown tool: ${toolName}`
      });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        errorCode: 'BRIDGE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown bridge error'
      });
    }
    return;
  }

  sendJson(res, 404, { ok: false, message: 'Not found' });
});

server.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
  console.log(`Bridge running at http://${BRIDGE_HOST}:${BRIDGE_PORT}`);
});
