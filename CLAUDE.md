# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

FlattyBot is a Telegram bot (Grammy) that matches Geneva apartment listings to user search criteria. It reads from a Supabase/Postgres database that is **populated by external scrapers** — this repo contains no scrapers. Its scope is: OpenAI-based extraction of user criteria, location/scoring logic, and alert distribution.

Runtime is `ts-node` directly on `src/` (no compiled build step in dev/prod). Entry point: `src/index.ts` spawns the `PollingService` (3-min interval) and then starts the Grammy bot (blocking).

## Commands

```bash
npm run dev                    # nodemon + ts-node, watches src/**/*.ts, NODE_ENV=development
npm start                      # ts-node src/index.ts, NODE_ENV=production
npm test                       # vitest run — unit + scoring tests (src/tests/**/*.test.ts)
npm run test:watch             # vitest in watch mode
npm run test:coverage          # vitest run --coverage
npm run test:e2e               # NODE_ENV=development vitest run --config vitest-e2e.config.ts (onboarding scenarios)
npm run e2e:pull-snapshot      # refresh the DB snapshot used by e2e tests
npm run eval                   # tests/cli/flattybot-eval.ts — extraction + scoring evaluation pipeline
npm run filter-test            # src/tools/filter-tester.ts — interactive filter sandbox
npm run build                  # tsc — rarely needed; runtime uses ts-node
```

Eval CLI sub-modes (see `tests/cli/flattybot-eval.ts`):
- `npm run eval -- --pull-listings` — refresh `tests/fixtures/listings.json` from the dev DB
- `npm run eval -- --test extraction|scoring|all` (default `all`)
- `npm run eval -- --file <path>` / `--case <num>` — target a specific dataset / case

There is no project-wide lint config. Tests run on **Vitest** (`vitest.config.ts` for unit/scoring, `vitest-e2e.config.ts` for the onboarding e2e suite). Unit and scoring tests live in `src/tests/` (`*.test.ts`); end-to-end onboarding scenarios live in `src/tests/e2e/` and drive the bot through a fake harness (`src/tests/e2e/_harness/`), with scenarios documented in `tests/SCENARIOS.md`. The `npm run eval` CLI is a separate `ts-node` extraction/scoring evaluation tool (not Vitest).

## Environment

Env is loaded via `dotenv` from `.env.${NODE_ENV}` (e.g. `.env.development`, `.env.production`) — **not** from `.env`. Template at `.env.template`. Required vars: `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_KEY`, `OPENAI_API_KEY`, `DB_SCHEMA`, `ADMIN_TELEGRAM_ID`.

`DB_SCHEMA` selects a Postgres schema (`flatscanner` for prod, `flatscanner_dev` for dev) — Supabase client is constructed with `{ db: { schema: dbSchema } }` in `src/config/supabase.ts`, so every repository query is automatically schema-scoped. Migrations under `migrations/` are applied in order; `000_create_dev_schema.sql` bootstraps the dev schema.

## Architecture

### Two-loop runtime
`src/index.ts` runs two concurrent loops via `PollingService.startPolling`:
1. **Ad polling loop** (default 180s): fetch new ads → for each active user, score every ad → send Telegram alert if `score_total > 0`. Per-user dedup goes through `sent_alerts` keyed by `(user_id, ad_id, source)`.
2. **Inactivity loop** (hourly): `UserRepository.deactivateInactiveUsers(INACTIVITY_TIMEOUT_MINUTES)` — default 14 days; deactivated users get notified before being dropped from polling.

### Multi-source ad aggregation
`AdAggregationService` unifies two ad sources behind a single `AdContext { source, scoringAd, facebookAd?, agencyAd? }`:
- **Facebook** (`fb_annonces_location` table, `AdRepository`): sliding 48h window, dedup via `sent_alerts`.
- **Agency / régies** (`AgencyAdRepository`): processed strictly after an in-memory `lastAgencyCreatedAt` cursor — each agency ad is seen once per process lifetime.

Both sources are normalized to a shared `ScoringAd` (= the `Ad` type) so `ScoringService` stays source-agnostic. When adding a new source, follow the same pattern: extend `AdSource`, populate `scoringAd`, and the polling/scoring path needs no changes.

### Scoring model (`src/services/scoring.service.ts`)
Two-tier scoring:
- **Strict criteria** (zone, budget, pièces, type_logement, etc.): if **any** strict criterion fails, `score_total = 0` and no alert is sent. The poller's "is this a match?" check is literally `score_total > 0`.
- **Comfort criteria** (balcon, parking, meuble, …): additive bonus points; never cause rejection.

`ScoreResult.checks[]` and `rejectionReasons[]` are populated for explainability — used by the eval CLI and the alert formatter.

### Location engine (G-Loc)
Three collaborating pieces, all data-driven:
- `src/data/known_locations.json` — canonical Geneva places + variantes orthographiques, codes postaux, mapping exclusif (e.g. "Genève" inside the city context maps to inner districts only).
- `src/data/proximity.json` — proximity graph used for "suggest adjacent zones" in onboarding (`ProximityGraph`).
- `src/data/db_terms_mapping.json` — bridges raw DB terms to canonicals.
- `LocationRepository.findCanonical(term, expand)` is the entry point. `resolveAdLocation(ad, isGeneve)` collapses an ad's address into canonical zones, with a fallback that re-scans `adresse_complete` / Facebook post text when structured fields don't resolve.

Scoring **normalizes user zones to canonicals before comparison** (`scoring.service.ts` ~L40-55). When touching location logic, preserve this normalize-both-sides invariant or zone matches will silently drop.

### Bot session & onboarding
Grammy session lives in `src/bot/context.ts` (`SessionData.step` is the state machine). The onboarding flow is documented in `onboarding_flow.md` (Mermaid diagram) — read it before touching the onboarding code. Onboarding now lives in its own module under `src/bot/onboarding/`:
- `onboarding/index.ts` — registers the Grammy handlers (language callbacks, text message dispatch by `session.step`, recap/edit callbacks).
- `onboarding/steps.ts` — the individual step transitions (`enterLanguageStep`, `enterWelcomeStep`, `runExtractionRound`, `enterRecapStep`, `enterLocationStep`, `runMarketCheck`, `runPreview`, …) driven by `session.step` and the OpenAI extraction loop (up to 3 rounds of missing-criteria follow-ups, then fallback).

`src/bot/handlers.ts` retains the non-onboarding handlers (commands, menu, etc.). All user-facing strings are centralized in `src/i18n/strings.ts` via `t(lang, key, ...args)` with `fr`/`en` maps — add strings there rather than inlining them.

The **market check** (`src/services/market-check.service.ts`, `MarketCheckService.countMatchesOverWindow`) runs during onboarding to tell the user how many ads in the recent window match their criteria before they confirm — a feasibility signal so they can loosen criteria if the result is 0.

New users hit a middleware in `src/bot/index.ts` that creates a `pending` user row and pings `ADMIN_TELEGRAM_ID` with an Approve/Reject inline keyboard — until approved, the user is in `AWAITING_AUTHORIZATION`.

After the user confirms criteria, `PollingService.runCatchup(userTelegramId)` is invoked synchronously to scan the last 48h and send up to the top 5 matches — this is separate from the main polling loop and is the only path that ranks before sending.

### OpenAI extraction
`OpenAIService.extractCriteria` (`src/services/openai.service.ts`) returns `ExtractedCriteria` via a JSON schema defined in `src/services/openai.prompts.ts`. It accepts `conversationHistory` and `existingCriteria` so iterative refinements ("monte à 2800 CHF") merge into the existing object instead of starting over. The schema is the contract between the bot, the DB (`user_criteria.criteres_stricts/criteres_confort` JSONB columns), and the scoring engine — changing fields means touching all three.

## Conventions

- Repositories under `src/repositories/` wrap Supabase queries; service classes orchestrate them. Don't query Supabase directly from `src/bot/` — go through a repository.
- The scoring engine is the single source of truth for "does this ad match this user?". The poller, the catchup, and the eval CLI all call `ScoringService.calculateScore` with the same inputs.
- User-facing strings are in French (the product is FR-first, EN supported via the language step in onboarding). They live in `src/i18n/strings.ts` — add/edit them there, don't inline strings in handlers.
