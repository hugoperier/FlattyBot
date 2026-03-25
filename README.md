<div align="center">

<img src="https://img.shields.io/badge/Telegram-Bot-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram Bot"/>
<img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js"/>
<img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase"/>
<img src="https://img.shields.io/badge/OpenAI-GPT--4o_Nano-412991?style=for-the-badge&logo=openai&logoColor=white" alt="OpenAI"/>

# 🏠 FlattyBot

**Le bot Telegram intelligent pour trouver votre appartement à Genève — en temps réel.**

FlattyBot est un bot Telegram intelligent de recherche d'appartements à Genève. Il utilise l'IA (**OpenAI GPT-5.4 Nano**) pour comprendre les besoins des utilisateurs et un moteur de localisation avancé pour envoyer des alertes ultra-pertinentes en temps réel.

<a href="https://t.me/FlatScout1_bot?start=gh">
  <img src="https://img.shields.io/badge/🚀_Essayer_FlattyBot-Telegram-26A5E4?style=for-the-badge" alt="Try FlattyBot on Telegram"/>
</a>

</div>

## 🚀 Fonctionnalités Clés

- **Onboarding Conversationnel** : Décrivez votre recherche en langage naturel.
- **Support Multi-Source** : Agrégation des annonces issues de **Facebook** (via Marketplace) et des **Régies Immobilières** genevoises.
- **Filtrage Intelligent** : Distinction automatique entre **Appartements** entiers et **Colocations**.
- **Moteur de Localisation G-Loc** : Reconnaissance naturelle des quartiers et communes de Genève (Plainpalais, Cornavin, Eaux-Vives, etc.) via un graphe de proximité.
- **Scoring & Matching** : Chaque annonce reçoit un score détaillé basé sur vos critères stricts (budget, pièces) et de confort.
- **Gestion de l'Inactivité** : Suspension automatique des alertes après 2 semaines d'inactivité.

## 🏗️ Architecture

- `src/bot` : Interface Telegram (utilisant [Grammy](https://grammy.dev/)).
- `src/services` :
  - **Scoring** : Algorithme de matching et gestion du confort.
  - **OpenAI** : Extraction structurée avec GPT-5.4 Nano.
  - **Polling** : Surveillance des nouvelles annonces Multi-Source.
- `src/repositories` : Couche d'accès aux données Supabase (Annonces, Agences, Users).
- `src/data` : Graphe des quartiers (`proximity.json`) et mapping des localisations.

## 🛠️ Installation & Configuration

### Prérequis
- Node.js 18+
- Instance Supabase (Schéma `flatscanner` recommandé)
- Clés API : OpenAI, Telegram Bot Token.

### 1. Setup
```bash
git clone https://github.com/hugoperier/FlattyBot.git
cd FlattyBot
npm install
```

### 2. Variables d'environnement
Copiez `.env.template` vers `.env.development` ou `.env.production` selon votre contexte.
```bash
cp .env.template .env.development
```

### 3. Schéma de base de données
1. Exécutez `migrations/000_create_dev_schema.sql` pour initialiser le schéma `flatscanner_dev`.
2. Appliquez les migrations successives (`001`, `002`, etc.) pour les fonctionnalités additionnelles.

## 💻 Utilisation

### Développement
Lancer le bot en mode watch avec monitoring :
```bash
npm run dev
```

### Évaluation & Audit (CLI)
Le bot inclut un outil robuste pour tester et auditer la qualité des extractions et du scoring :
```bash
# Lancer le pipeline d'évaluation sur le dataset de test
npm run eval
```

### Tests
```bash
npm test
```

## 🔐 Sécurité & Maintenance
- **Autorisation** : Système de validation d'accès (Admin whitelist).
- **Inactivité** : Les utilisateurs inactifs sont notifiés avant désactivation pour libérer les ressources de polling.

## ⚠️ Limitations & Scope
FlattyBot est un moteur de matching et d'alertes. Il **ne contient pas** les scrapers (Facebook, Marketplace, Régies, etc.). Le bot part du principe que la base de données est alimentée par des services tiers (scrapers périodiques). Son périmètre se limite exclusivement à l'analyse (OpenAI), le scoring et la distribution intelligente des alertes.
