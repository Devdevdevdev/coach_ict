# COACH ICT (FR)

COACH ICT est une app de coaching trading IA (style ICT/SMC), pensée pour aller vite:

1. tu choisis une paire
2. tu cliques `Lancer Coach IA`
3. tu reçois une analyse structurée et exploitable

Réponse coach attendue:
- biais de marché
- setup
- entrée / SL / TP / RR
- sections `⚠️ piège`, `🎯 plan`, `💬 coaching`

## Pourquoi cette app

- Interface volontairement épurée
- Aucun bridge TradingView / Chrome CDP
- BYOK: chaque utilisateur garde sa propre clé API
- Projet open source facile à améliorer

## Fonctionnalités

- Écran d'accès initial (clé API Kimi)
- Écran principal de coaching avec sélection de paire:
  - XAUUSD
  - XAGUSD
  - EURUSD
  - GBPUSD
  - USDJPY
- Bouton `Lancer Coach IA` (analyse en 1 clic)
- Bouton `Accès` pour modifier la clé
- Toggle langue `FR/EN`
- Format coaching structuré côté backend

## Stack technique

- Backend Node.js (`server.mjs`)
- Frontend HTML/CSS/JS (`public/`)
- API Kimi pour le moteur IA
- Service OHLC via endpoint Yahoo Finance

## Installation

```bash
npm install
npm run dev
```

Application locale:
- http://127.0.0.1:3000

## Variables d'environnement

Créer `.env` depuis `.env.example`:

```env
KIMI_API_KEY=
KIMI_BASE_URL=https://api.moonshot.ai/v1
PORT=3000
```

## Contribuer

Les contributions sont bienvenues:
- amélioration du prompt ICT/SMC
- amélioration de la clarté des plans de trade
- amélioration UX/performance
- ajout de tests/validations

Ouvre une issue ou une PR.

## Avertissement

Application fournie uniquement à des fins éducatives et de divertissement.
Ce n'est pas un conseil financier ni une incitation à investir.
Tu restes entièrement responsable de tes décisions et de ton risque.
