# COACH ICT (FR)

COACH ICT est une application web locale qui combine:
- un chat IA (Kimi API)
- un bridge TradingView (CDP)
- un mode coaching ICT/SMC structuré (1H, 15M, 5M)

## Avertissement important

Cette application est fournie **uniquement à des fins de divertissement et d'apprentissage**.

Ce n'est **pas**:
- un conseil financier
- une recommandation d'investissement
- une incitation à acheter ou vendre un actif

Tu restes seul responsable de tes décisions de trading, de ton risque, et de tes pertes éventuelles.

## Fonctionnalités principales

- Écran d'accueil d'accès utilisateur:
  - clé API Kimi
  - ID / session TradingView
- Écran principal chat plein largeur après validation des accès
- Bouton `Accès` pour revenir modifier les identifiants
- Bouton `ICT STRICT` pour forcer un format de réponse coaching
- Toggle de langue FR/EN
- Indicateur visuel de chargement pendant l'analyse IA
- Nettoyage d'affichage (suppression des marqueurs markdown `**` et `##`)
- Analyse multi-timeframe orientée coaching
- Ajout systématique des sections:
  - `⚠️ piège`
  - `🎯 plan`
  - `💬 coaching`

## Architecture

- `server.mjs`: backend principal (chat, prompt coach, logique stricte)
- `bridge/server.mjs`: bridge TradingView via Chrome DevTools Protocol
- `public/`: interface frontend

## Prérequis

- Node.js 18+
- clé API Kimi (Moonshot)
- TradingView ouvert dans Chrome (debug géré automatiquement par le bridge)

## Installation et lancement

```bash
npm install
npm run bridge:dev
npm run dev
```

Application:
- http://127.0.0.1:3000

Bridge health:
- http://127.0.0.1:8787/health

## Utilisation FR / EN

- L'application démarre avec la langue précédemment utilisée (mémorisée localement).
- Pour passer en français ou en anglais, utilise le bouton `FR/EN` en haut à droite de l'interface.
- Le changement de langue s'applique à l'UI et au style de réponse du coach.

## Variables d'environnement

Exemple dans `.env`:

```env
TRADINGVIEW_BRIDGE_URL=http://127.0.0.1:8787
CHROME_DEBUG_URL=http://127.0.0.1:9222
TV_TAB_MATCH=tradingview.com
AUTO_START_CHROME=true
```

## Publication GitHub public

```bash
git init
git add -A
git commit -m "feat: coach ict app"
git branch -M main
git remote add origin https://github.com/<TON_USER>/<TON_REPO>.git
git push -u origin main
```

Puis sur GitHub:
- Settings -> General -> Visibility -> Public

## Sécurité

- Ne commit jamais de secrets (`.env` est ignoré)
- Utilise des clés API individuelles
- Révoque/regénère immédiatement une clé exposée
