# FlattyBot 🏠

FlattyBot est un bot Telegram intelligent qui aide les utilisateurs à trouver des appartements à Genève. Il utilise l'IA (OpenAI GPT-4) pour comprendre les besoins des utilisateurs et un système de scoring pour envoyer des alertes personnalisées en temps réel.

## Fonctionnalités

- **Onboarding Conversationnel** : Décrivez votre recherche en langage naturel.
- **Extraction Intelligente** : Le bot identifie vos critères stricts (budget, zone, pièces) et de confort (balcon, calme, etc.).
- **Scoring & Matching** : Chaque annonce reçoit un score de pertinence.
- **Alertes Temps Réel** : Recevez les meilleures offres moins de 5 minutes après leur publication.
- **Gestion Facile** : Mettez en pause, reprenez ou modifiez vos critères via le menu.

## Prérequis

- Node.js 18+
- Compte Supabase (avec les tables `fb_annonces_location` et `facebook_posts`)
- Clé API OpenAI
- Token Bot Telegram

## Installation

1. Cloner le repo
2. Installer les dépendances :
   ```bash
   npm install
   ```
3. Configurer les variables d'environnement :
   Copiez `.env.template` vers `.env` et remplissez les valeurs.
   ```bash
   cp .env.template .env
   ```
4. Initialiser la base de données :
   Exécutez le script SQL `migrations/001_initial_schema.sql` dans votre dashboard Supabase.

## Démarrage

Pour le développement :
```bash
npm run dev
```

Pour la production :
```bash
npm run build
npm start
```

## Architecture

- `src/bot` : Gestion des interactions Telegram (Grammy).
- `src/services` : Logique métier (OpenAI, Scoring, Polling).
- `src/repositories` : Accès aux données (Supabase).

## Tests

Pour lancer les tests unitaires (Scoring & LLM) :
```bash
npm test
```
