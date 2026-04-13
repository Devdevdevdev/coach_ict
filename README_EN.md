# COACH ICT (EN)

COACH ICT is an AI trading coach app (ICT/SMC style) designed for fast execution:

1. select a pair
2. click `Run AI Coach`
3. get a structured coaching output

Typical response includes:
- market bias
- setup logic
- entry / SL / TP / RR
- `⚠️ trap`, `🎯 plan`, `💬 coaching` sections

## Why this project

- Clean interface, minimal friction
- No TradingView bridge or Chrome CDP dependency
- BYOK model (users keep their own API key)
- Open-source and contributor-friendly

## Features

- Access onboarding with Kimi API key
- Main coaching screen with pair selector:
  - XAUUSD
  - XAGUSD
  - EURUSD
  - GBPUSD
  - USDJPY
- One-click analysis via `Run AI Coach`
- `Access` button to edit credentials
- FR/EN language toggle
- Structured coach formatting enforced by backend

## Tech stack

- Node.js backend (`server.mjs`)
- Vanilla frontend (`public/`)
- Kimi API for AI coaching
- OHLC service via Yahoo Finance endpoint

## Install and run

```bash
npm install
npm run dev
```

App:
- http://127.0.0.1:3000

## Environment variables

Create `.env` from `.env.example`:

```env
KIMI_API_KEY=
KIMI_BASE_URL=https://api.moonshot.ai/v1
PORT=3000
```

## Contributing

Contributions are welcome:
- better ICT/SMC prompting
- better risk-management clarity
- UX/performance improvements
- tests and validation improvements

Open an issue or submit a PR.

## Disclaimer

For educational and entertainment purposes only.
Not financial advice, investment advice, or trading solicitation.
You are fully responsible for your decisions and risk.
