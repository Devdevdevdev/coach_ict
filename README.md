# COACH ICT

AI trading coach app (ICT/SMC style) focused on quick, structured analysis.

Choose a pair, click **Run AI Coach**, and get a clear coaching response with:
- market bias
- setup logic
- entry/SL/TP/RR guidance
- trap/plan/coaching sections

Built for local use with user-owned API keys (BYOK), in French and English.

## Why This App

- Fast to test locally
- Clean interface (no manual prompt box required)
- Structured coaching output instead of generic AI text
- Open source and easy to extend

## Features

- Onboarding access screen with Kimi API key
- Main coaching screen with pair selector:
  - XAUUSD
  - XAGUSD
  - EURUSD
  - GBPUSD
  - USDJPY
- One-click analysis with **Run AI Coach**
- FR/EN language toggle
- Access screen reopen button to change key
- Strictly formatted coaching behavior on backend

## Tech Stack

- Node.js backend (`server.mjs`)
- Vanilla frontend (`public/`)
- Kimi API for LLM coaching
- OHLC market data fetch (Yahoo Finance endpoint)

## Quick Start

```bash
npm install
npm run dev
```

Open: http://127.0.0.1:3000

## Environment

Create `.env` from `.env.example`:

```env
KIMI_API_KEY=
KIMI_BASE_URL=https://api.moonshot.ai/v1
PORT=3000
```

## Contributing

Contributions are welcome:
- improve ICT/SMC prompt quality
- improve risk management output
- improve UX/performance
- add tests or validation layers

Open an issue or submit a PR.

## Docs

- 🇫🇷 French: [README_FR.md](./README_FR.md)
- 🇬🇧 English: [README_EN.md](./README_EN.md)

## Disclaimer

For educational and entertainment purposes only.
Not financial advice, investment advice, or trading solicitation.
You are fully responsible for your trading decisions and risk.
