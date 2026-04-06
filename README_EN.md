# COACH ICT (EN)

COACH ICT is a local web app combining:
- AI chat (Kimi API)
- TradingView bridge (CDP)
- structured ICT/SMC coaching mode (1H, 15M, 5M)

## Important disclaimer

This app is provided **for entertainment and learning purposes only**.

It is **not**:
- financial advice
- investment advice
- an invitation to buy or sell any asset

You are solely responsible for your trading decisions, risk management, and any losses.

## Main features

- First access screen:
  - Kimi API key
  - TradingView ID/session
- Full-width main chat screen after access validation
- `Access` button to reopen credentials screen and edit keys
- `ICT STRICT` toggle to force structured coaching responses
- FR/EN language toggle
- Visible loading indicator while AI is processing
- Output cleanup (removes markdown markers `**` and `##`)
- Multi-timeframe coaching analysis
- Always includes sections:
  - `⚠️ trap`
  - `🎯 plan`
  - `💬 coaching`

## Architecture

- `server.mjs`: main backend (chat, coach prompt, strict flow)
- `bridge/server.mjs`: TradingView bridge via Chrome DevTools Protocol
- `public/`: frontend interface

## Requirements

- Node.js 18+
- Kimi API key (Moonshot)
- TradingView open in Chrome (debug can be auto-started by the bridge)

## Install and run

```bash
npm install
npm run bridge:dev
npm run dev
```

App:
- http://127.0.0.1:3000

Bridge health:
- http://127.0.0.1:8787/health

## FR / EN usage

- The app starts with the last selected language (stored locally).
- To switch between French and English, use the `FR/EN` button at the top-right of the interface.
- Language switching applies to both UI labels and coach response style.

## Environment variables

Example `.env`:

```env
TRADINGVIEW_BRIDGE_URL=http://127.0.0.1:8787
CHROME_DEBUG_URL=http://127.0.0.1:9222
TV_TAB_MATCH=tradingview.com
AUTO_START_CHROME=true
```

## Public GitHub push

```bash
git init
git add -A
git commit -m "feat: coach ict app"
git branch -M main
git remote add origin https://github.com/<YOUR_USER>/<YOUR_REPO>.git
git push -u origin main
```

Then on GitHub:
- Settings -> General -> Visibility -> Public

## Security

- Never commit secrets (`.env` is gitignored)
- Use per-user API keys
- Revoke/regenerate exposed keys immediately
