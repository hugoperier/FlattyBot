# FlattyBot Onboarding — E2E Test Scenarios

## Product Overview

FlattyBot is a Telegram apartment-hunt concierge for Geneva. Users describe in natural language what they want ("3 pièces à Carouge, max 2500 CHF, disponible en septembre") and the bot converts that into a structured search profile. Once active, the bot polls newly scraped listings every 3 minutes and sends instant alerts for matches.

**The onboarding conversation is the product's critical path.** It does four jobs: (1) translate free-form prose into a precise `criteres_stricts` JSON record, (2) resolve neighborhood names to canonical zones and surface adjacent options the user may have missed, (3) reality-check criteria against the live market so the user knows whether they'll hear from the bot once a month or every day, and (4) deliver an immediate preview of the last 48 hours of matches so the value is tangible before the user closes the app.

**Hard-stop rule (from `src/services/scoring.service.ts`):** if any single strict criterion (zone, budget, room count, housing type) fails, `score_total = 0` and no alert fires. Onboarding must therefore capture those criteria correctly — wrong zones mean silence.

---

## Step Inventory

The bot's session state machine lives in `src/bot/context.ts`. Observable behavior per state:

| Step | Session state | Bot message / keyboard | Advance trigger |
|------|--------------|----------------------|-----------------|
| Language | `ONBOARDING_LANGUAGE` | Language picker (FR / EN buttons) | User clicks `lang_fr` or `lang_en` |
| Welcome | `ONBOARDING_WAITING_DESCRIPTION` | Explains the bot, asks for free-text search | User types a description |
| Extraction | `ONBOARDING_ASKING_MISSING` | "Analyzing…" (edited to comprehension summary), then asks for 1 missing criterion with quick-fill keyboard | User types or clicks quick-fill |
| Fallback | `ONBOARDING_FALLBACK` | "Having trouble…" with Continue/Restart buttons | 4 extraction rounds without full criteria |
| Housing type (ambiguous) | `ONBOARDING_WAITING_TYPE_LOGEMENT` | Apartment / Flatshare / Both keyboard | User clicks one |
| Recap | `ONBOARDING_WAITING_CONFIRMATION` | Visual summary of criteria — Confirm / Modify / Restart | User clicks one |
| Modify | `ONBOARDING_WAITING_MODIFICATION` | "What do you want to change?" | User types change, loops back to extraction |
| Location suggestion | `ONBOARDING_WAITING_LOCATION_VALIDATION` | Lists verified zones + proximity suggestions; Include all / Keep strict / Modify | User clicks one |
| Location clarification | `ONBOARDING_WAITING_LOCATION_CLARIFICATION` | "Unknown zone(s): …" | User types a known zone |
| Market check | `ONBOARDING_WAITING_MARKET_DECISION` (only when <5 matches) | Low/zero match count + Continue / Widen | User clicks one |
| Final | `IDLE` | "Surveillance activée !" + criteria recap | — |

---

## User Profile Scenarios

---

### Profile 1 — The Decisive Expat

**Persona:** English-speaking professional relocating to Geneva. Knows exactly what they want and expresses it completely in a single message.

**Language code:** `en`

**Opening message:**
> "Looking for a 3-room apartment in Eaux-Vives, max 2500 CHF/month, available in September"

**Expected path through the flow:**
1. `/start` → bot detects EN → shows language picker
2. User clicks `lang_en`
3. Bot shows EN welcome
4. User sends the opening message
5. OpenAI extracts all criteria in one round (budget, zones, rooms, disponibilité — no missing fields)
6. Bot shows recap (EN)
7. User clicks `confirm_criteria`
8. Bot enters location step — Eaux-Vives neighbors: Jonction, Cité-Centre, Champel, Cologny → shows suggestion
9. User clicks `conf_loc_all` (includes neighbors)
10. Bot runs market check → sends market feedback
11. Bot saves criteria and runs preview (catchup)
12. Bot sends final confirmation → session step = IDLE

**Key assertions:**
- After step 5: no follow-up question from the bot (extraction was complete in 1 round)
- After step 8: `suggestedZones` contains at least one of `['Jonction', 'Cité-Centre', 'Champel', 'Cologny']`
- After step 9: saved criteria zones include both original and suggested zones
- Final: `UserRepository.saveCriteria` was called with `user_id === userId`
- Final: `PollingService.runCatchup` was called with the userId
- Final: session step is IDLE, all temp fields undefined

**Steps exercised:**
`ONBOARDING_LANGUAGE` → `ONBOARDING_WAITING_DESCRIPTION` → `ONBOARDING_WAITING_CONFIRMATION` → `ONBOARDING_WAITING_LOCATION_VALIDATION` → market check → IDLE

---

### Profile 2 — The Vague Local

**Persona:** French speaker who knows they want an apartment in Geneva but hasn't thought through the details. Relies on the bot's quick-fill keyboards to set budget, rooms, and availability.

**Language code:** `fr`

**Opening message:**
> "Salut je cherche un appart à Genève"

**Expected path through the flow:**
1. `/start` → bot detects FR → skips language picker, goes straight to welcome
2. User sends opening message
3. OpenAI extracts partial criteria (zones = ['Genève'], budget/rooms/disponibilité missing)
4. Bot asks for budget (quick-fill keyboard) — `ONBOARDING_ASKING_MISSING`
5. User clicks `qf_budget_2500`
6. Bot asks for rooms — `ONBOARDING_ASKING_MISSING`
7. User clicks `qf_pieces_3`
8. Bot asks for disponibilité — `ONBOARDING_ASKING_MISSING`
9. User clicks `qf_avail_flexible`
10. All criteria now complete → housing type disambiguation (Genève without explicit type → OpenAI guesses appartement or bot asks)
11. Recap → user confirms → location step → market check → final

**Key assertions:**
- After step 2: bot enters `ONBOARDING_ASKING_MISSING` (at least one quick-fill keyboard was shown)
- After step 5: budget quick-fill message was sent (`qf_budget_2500`)
- After step 9: `session.skipAvailAsk = true`
- After step 11: saved criteria has `budget_max = 2500`, `nombre_pieces_min = 3`
- Final: `UserRepository.saveCriteria` was called

**Steps exercised:**
`ONBOARDING_WAITING_DESCRIPTION` → `ONBOARDING_ASKING_MISSING` × 3 (quick-fill path) → recap → final

---

### Profile 3 — The Flexible Explorer

**Persona:** French speaker who knows their zone but is open to nearby neighborhoods if suggested.

**Language code:** `fr`

**Opening message:**
> "Appartement à Plainpalais, budget 2200 CHF, 2 pièces minimum, disponible maintenant"

**Expected path through the flow:**
1. `/start` → FR detected → welcome
2. User sends message → full extraction in 1 round
3. Recap → user confirms
4. Location step: Plainpalais neighbors = [Jonction, Acacias, Champel, Cité-Centre] → suggestion shown
5. User clicks `conf_loc_all` → zones expanded to include all neighbors
6. Market check → final

**Key assertions:**
- After step 5: saved criteria zones include `'Plainpalais'` and at least one neighbor
- The zones array has more entries than what the user originally specified

**Steps exercised:**
`ONBOARDING_WAITING_DESCRIPTION` → `ONBOARDING_WAITING_CONFIRMATION` → `ONBOARDING_WAITING_LOCATION_VALIDATION` → `conf_loc_all` path

---

### Profile 4 — The Strict Purist

**Persona:** Same setup as Profile 3 but insists on their exact zone — no suggestions.

**Language code:** `fr`

**Opening message:**
> "Appartement à Plainpalais, budget 2200 CHF, 2 pièces, disponible maintenant"

**Expected path through the flow:**
1–4. Same as Profile 3 through the location suggestion step
5. User clicks `conf_loc_strict` → zones remain only `['Plainpalais']`
6. Market check → final

**Key assertions:**
- After step 5: saved criteria zones = `['Plainpalais']` (neighbors NOT added)
- No extra zones from proximity graph in the final criteria

**Steps exercised:**
`ONBOARDING_WAITING_LOCATION_VALIDATION` → `conf_loc_strict` path

---

### Profile 5 — The Unknown-Zone Seeker

**Persona:** User mentions a neighborhood not in `src/data/known_locations.json`, triggering location clarification.

**Language code:** `fr`

**Opening message:**
> "Appartement à Champ-Dollon, budget 2000 CHF, 2 pièces, disponible maintenant"

(Champ-Dollon is a prison / area not in canonical zones)

**Expected path through the flow:**
1. `/start` → FR welcome
2. User sends message → extraction round 1 → zones = ['Champ-Dollon']
3. Location step: `LocationRepository.findCanonical('Champ-Dollon')` returns `[]`
4. Bot sends unknown-zone message → step = `ONBOARDING_WAITING_LOCATION_CLARIFICATION`
5. User types: "Plainpalais"
6. Re-extraction round → zones resolved to `['Plainpalais']` → location suggestion step (Plainpalais has neighbors)
7. User picks `conf_loc_strict`
8. Market check → final

**Key assertions:**
- After step 4: bot message contains "inconnu" (or "unknown")
- After step 6: session step exits `ONBOARDING_WAITING_LOCATION_CLARIFICATION`
- Final: saved zones do not contain 'Champ-Dollon'

**Steps exercised:**
`ONBOARDING_WAITING_LOCATION_CLARIFICATION` → re-extraction → location validation

---

### Profile 6 — The Colocataire

**Persona:** User looking for a flatshare / room rather than an apartment. Tests the colocation housing-type branch.

**Language code:** `fr`

**Opening message:**
> "Je cherche une coloc, chambre meublée, max 1200 CHF, disponible dès que possible, à Carouge"

**Expected path through the flow:**
1. `/start` → FR welcome
2. User sends message → extraction: type_logement contains 'colocation', budget=1200, zones=['Carouge'], disponibilite present
3. `determineHousingType` → 'colocation' → sets `type_logement = ['colocation', 'chambre', 'chambre partagée']`
4. Recap → user confirms
5. Location step: Carouge neighbors = [Acacias, Lancy, Champel, Veyrier] → suggestion
6. User picks `conf_loc_strict`
7. Market check → final

**Key assertions:**
- After step 3: `tempCriteria.criteres_stricts.type_logement` is `['colocation', 'chambre', 'chambre partagée']`
- Recap message was NOT preceded by housing-type disambiguation keyboard
- Final: saved `type_logement` contains 'colocation'

**Steps exercised:**
Colocation branch of `determineHousingType` — skips `ONBOARDING_WAITING_TYPE_LOGEMENT` entirely

---

### Profile 7 — The Ambiguous Type

**Persona:** User doesn't say apartment vs flatshare, triggering the housing type disambiguation step.

**Language code:** `fr`

**Opening message:**
> "Je cherche un logement à Genève, 2-3 pièces, budget 2000 CHF, disponible maintenant"

**Expected path through the flow:**
1. `/start` → FR welcome
2. User sends message → extraction: type_logement empty or ambiguous
3. `determineHousingType` → 'unknown' → bot sends housing type keyboard (`ONBOARDING_WAITING_TYPE_LOGEMENT`)
4. User clicks `type_all` ("Les deux m'intéressent")
5. `type_logement` = full list → recap → confirm
6. Location step → market check → final

**Key assertions:**
- After step 3: bot sent a message with housing-type keyboard buttons (type_appart / type_coloc / type_all)
- After step 4: `type_logement` contains both apartment and flatshare types
- Final: saved `type_logement` includes 'appartement' and 'colocation'

**Steps exercised:**
`ONBOARDING_WAITING_TYPE_LOGEMENT` → `type_all` callback

---

### Profile 8 — The Picky Perfectionist

**Persona:** Very strict criteria that match almost nothing in the current dataset — tests the low-market-count decision step.

**Language code:** `fr`

**Opening message:**
> "Appartement de 5 pièces dans le Vieux-Genève, max 1500 CHF, disponible immédiatement, terrasse et parking obligatoires"

**Expected path through the flow:**
1. `/start` → FR welcome
2. User sends message → full extraction (niche criteria)
3. Recap → user confirms
4. Location step → no proximity suggestions for 'Cité-Centre' (or suggestions shown, user clicks strict)
5. Market check → `countMatchesOverWindow` returns < 5 (using sparse DB snapshot)
6. Bot sends low-match message (`ONBOARDING_WAITING_MARKET_DECISION`)
7. User clicks `market_continue`
8. Bot saves criteria, runs preview, sends final

**Key assertions:**
- After step 6: step is `ONBOARDING_WAITING_MARKET_DECISION`
- Bot message contains the low/zero count warning
- After step 7: `UserRepository.saveCriteria` was called (monitoring activated despite low market)

**Steps exercised:**
`ONBOARDING_WAITING_MARKET_DECISION` → `market_continue` callback

---

### Profile 9 — The Corrector

**Persona:** User is happy with almost everything but goes back to modify their budget at the recap step.

**Language code:** `fr`

**Opening messages:**
1. "Appartement à Eaux-Vives, 2 pièces, 2000 CHF, disponible maintenant"
2. (after recap) clicks Modify → "Monte le budget à 2500 CHF"

**Expected path through the flow:**
1. `/start` → FR welcome
2. User sends first message → extraction → recap shown
3. User clicks `modify_criteria` → step = `ONBOARDING_WAITING_MODIFICATION`
4. User types the modification → re-extraction: budget updates to 2500 (merged with existing)
5. Updated recap shown → user confirms
6. Location step → market check → final

**Key assertions:**
- After step 3: step is `ONBOARDING_WAITING_MODIFICATION`
- After step 4: `tempCriteria.criteres_stricts.budget_max = 2500` (updated, not reset)
- After step 4: zones still contain 'Eaux-Vives' (merge preserved existing fields)
- Final: saved `budget_max` is 2500

**Steps exercised:**
`ONBOARDING_WAITING_MODIFICATION` → re-extraction merge → second recap confirm

---

### Profile 10 — The Give-Up User

**Persona:** User who never provides useful information over 4 extraction rounds, hitting the fallback. Tests both the continue and restart branches.

**Language code:** `fr`

**Messages:**
1. "Je cherche un logement"
2. "Quelque chose de bien"
3. "Je sais pas trop"
4. (4th round triggers fallback)

Then: tests `fallback_continue` (continue → recap with partial criteria) and separately `fallback_restart` (start over → back to welcome).

**Expected path through the flow:**

*Branch A (continue):*
1. `/start` → FR welcome
2–5. 4 vague messages → each triggers an extraction round → `extractionRounds` = 4 → fallback
6. Bot sends fallback message with Continue/Restart buttons
7. User clicks `fallback_continue`
8. Bot sends recap with whatever partial criteria exist
9. User confirms → location step → market check → final

*Branch B (restart):*
Steps 1–6 same, then:
7. User clicks `fallback_restart`
8. Bot resets (`extractionRounds = 0`, `tempCriteria = undefined`)
9. Bot sends welcome again → step = `ONBOARDING_WAITING_DESCRIPTION`

**Key assertions:**

Branch A:
- After step 5: step = `ONBOARDING_FALLBACK`
- Bot message matches the fallback string (contains "du mal à obtenir")
- After clicking `fallback_continue`: recap is shown (not another extraction round)

Branch B:
- After clicking `fallback_restart`: step = `ONBOARDING_WAITING_DESCRIPTION`
- `extractionRounds` reset to 0

**Steps exercised:**
`ONBOARDING_FALLBACK` → `fallback_continue` and `fallback_restart` callbacks

---

## Cross-Cutting Invariants

These must hold for **every** completed onboarding run regardless of profile:

1. **Session cleanup:** After `enterFinalStep`, all temp session fields (`tempCriteria`, `conversationHistory`, `existingCriteria`, `extractionRounds`, `originalDescription`, `verifiedZones`, `suggestedZones`, `skipBudgetAsk`, `skipPiecesAsk`, `skipAvailAsk`) are `undefined`. Session `step` is `'IDLE'`.

2. **Empty criteres_manquants:** When the extraction loop exits (to recap or fallback), `criteres_manquants` is empty or explicitly bypassed (fallback path).

3. **User identity:** Saved `user_criteria.user_id === ctx.from.id` — the criteria row belongs to the correct Telegram user.

4. **Catchup triggered:** `PollingService.runCatchup(userId)` is called exactly once per completed onboarding, after criteria are saved.

5. **No stale zones:** If `ONBOARDING_WAITING_LOCATION_CLARIFICATION` was entered, the final saved zones must not contain any string that `LocationRepository.findCanonical()` returns an empty array for.

6. **Language consistency:** All bot messages during a session use the language set in step 1. If `lang = 'en'`, no French strings are sent after the language selection.

7. **No double-save:** `UserRepository.saveCriteria` is called exactly once per completed onboarding.

---

## Running the Suite

```bash
# Full E2E suite (uses real OpenAI — costs tokens)
npm run test:e2e

# Single profile
npx vitest run --config vitest-e2e.config.ts src/tests/e2e/decisive-expat.e2e.test.ts

# Swap DB dataset (for picky-perfectionist)
E2E_DB_SNAPSHOT=sparse-geneva npm run test:e2e -- picky-perfectionist

# Pull a fresh DB snapshot from dev
npm run e2e:pull-snapshot -- --name default
npm run e2e:pull-snapshot -- --name sparse-geneva --max-ads 2
```

> **Note:** E2E tests call the real OpenAI API. Assertions target behavioral shape (step reached, criteria fields populated) rather than exact API output, so tests are resilient to model variation. Expect ~3–5 min for the full suite depending on API latency.
