# COACH ICT

AI trading coach app (ICT/SMC style) with:
- Kimi chat backend
- TradingView bridge
- strict multi-timeframe flow (1H / 15M / 5M)

## What This Repo Contains

- `server.mjs`: main API and coaching logic
- `bridge/server.mjs`: local TradingView bridge
- `public/`: web interface
- `README_FR.md`: full French documentation
- `README_EN.md`: full English documentation

## Quick Start

```bash
npm install
npm run bridge:dev
npm run dev
```

Open:
- App: http://127.0.0.1:3000
- Bridge health: http://127.0.0.1:8787/health

## Documentation

- 🇫🇷 French: [README_FR.md](./README_FR.md)
- 🇬🇧 English: [README_EN.md](./README_EN.md)

## Important Disclaimer

This project is for entertainment and educational purposes only.
It is not financial advice, investment advice, or an incentive to trade.
You are solely responsible for your own trading decisions and risk.
