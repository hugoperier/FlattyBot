-- ============================================================
-- Migration 005 — Pipeline d'évaluation (datasets, annotations, runs)
-- Target schema: flatscanner_dev
-- Pour la prod, remplacer toutes les occurrences de flatscanner_dev par flatscanner
-- ============================================================
--
-- Crée les 5 tables du pipeline d'éval :
--   eval_datasets       – datasets nommés (ensembles de cas à évaluer)
--   eval_cases          – cas individuels (snapshot autoportant d'un post FB)
--   eval_annotations    – vérité-terrain par cas (persiste entre les runs)
--   eval_runs           – exécutions d'évaluation avec métriques agrégées
--   eval_run_results    – résultats par-cas pour un run donné
-- ============================================================

-- ─── eval_datasets ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS flatscanner_dev.eval_datasets (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER eval_datasets_updated_at
    BEFORE UPDATE ON flatscanner_dev.eval_datasets
    FOR EACH ROW EXECUTE FUNCTION flatscanner_dev.update_updated_at_column();

-- ─── eval_cases ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS flatscanner_dev.eval_cases (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    dataset_id       UUID NOT NULL REFERENCES flatscanner_dev.eval_datasets(id) ON DELETE CASCADE,

    -- Identifiant du post (md5 canonical, même algorithme que generate_post_id dans fb-enricher)
    post_id          TEXT NOT NULL,

    -- Référence souple vers facebook_posts.id au moment du pull (nullable — le cas est autoportant)
    source_post_id   UUID,

    group_name       TEXT,

    -- Snapshot complet du post d'entrée (texte, photos, auteur…) — rend le cas autoportant
    input_data       JSONB NOT NULL,

    -- Chemin vers la miniature dans Supabase Storage (optionnel)
    image_path       TEXT,

    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT eval_cases_dataset_post_unique UNIQUE (dataset_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_eval_cases_dataset_id
    ON flatscanner_dev.eval_cases(dataset_id);

-- ─── eval_annotations ──────────────────────────────────────────────────────
-- Vérité-terrain manuelle par cas. Persiste entre les runs — séparée des résultats.
-- Une seule ligne par cas (UNIQUE case_id).

CREATE TABLE IF NOT EXISTS flatscanner_dev.eval_annotations (
    id                          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    case_id                     UUID NOT NULL UNIQUE
                                    REFERENCES flatscanner_dev.eval_cases(id) ON DELETE CASCADE,

    -- ── Classification ──────────────────────────────────────────────────────
    expected_categorie          flatscanner_dev.post_category,
    expected_est_offre_location BOOLEAN,

    -- ── Localisation ────────────────────────────────────────────────────────
    -- expected_no_location = true  →  on attend ZÉRO zone (mesure anti-hallucination)
    -- expected_no_location = false →  expected_zones liste les zones canoniques attendues
    --                                 (noms issus de known_locations.json lieux_canoniques)
    expected_no_location        BOOLEAN NOT NULL DEFAULT FALSE,
    expected_zones              TEXT[] NOT NULL DEFAULT '{}',

    -- ── Type de logement ────────────────────────────────────────────────────
    -- Libre pour tolérer colloc/chambre/studio… sans contrainte d'enum
    expected_type_logement      TEXT,

    -- ── Doublon ─────────────────────────────────────────────────────────────
    expected_is_duplicate       BOOLEAN NOT NULL DEFAULT FALSE,
    expected_duplicate_of       UUID REFERENCES flatscanner_dev.eval_cases(id) ON DELETE SET NULL,

    -- ── Métadonnées (longue traîne) ──────────────────────────────────────────
    -- JSONB flexible pour loyer_total, charges_mensuelles, nombre_pieces, surface_m2,
    -- nombre_chambres, etage, dernier_etage, meuble, balcon, etc.
    expected_metadata           JSONB NOT NULL DEFAULT '{}',

    -- ── Contexte ────────────────────────────────────────────────────────────
    notes                       TEXT,
    annotated_at                TIMESTAMP WITH TIME ZONE,
    annotated_by                TEXT,

    created_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eval_annotations_case_id
    ON flatscanner_dev.eval_annotations(case_id);

CREATE OR REPLACE TRIGGER eval_annotations_updated_at
    BEFORE UPDATE ON flatscanner_dev.eval_annotations
    FOR EACH ROW EXECUTE FUNCTION flatscanner_dev.update_updated_at_column();

-- ─── eval_runs ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS flatscanner_dev.eval_runs (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    dataset_id  UUID NOT NULL REFERENCES flatscanner_dev.eval_datasets(id) ON DELETE CASCADE,

    label       TEXT,
    git_sha     TEXT,

    -- Étapes exécutées : "all" | "llm" | "geocode" | "dedup"
    stages      TEXT NOT NULL DEFAULT 'all',

    -- Statut : 'running' → 'done' | 'failed'
    status      TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'done', 'failed')),

    -- Métriques agrégées (sortie de compute_all_metrics, format JSON)
    metrics     JSONB,

    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    finished_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_eval_runs_dataset_id
    ON flatscanner_dev.eval_runs(dataset_id);
CREATE INDEX IF NOT EXISTS idx_eval_runs_created_at
    ON flatscanner_dev.eval_runs(created_at DESC);

-- ─── eval_run_results ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS flatscanner_dev.eval_run_results (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    run_id              UUID NOT NULL REFERENCES flatscanner_dev.eval_runs(id) ON DELETE CASCADE,
    case_id             UUID NOT NULL REFERENCES flatscanner_dev.eval_cases(id) ON DELETE CASCADE,

    -- ── Étape LLM ───────────────────────────────────────────────────────────
    llm_output          JSONB,   -- sortie complète (categorie, est_offre_location, donnees_extraites)
    llm_diff            JSONB,   -- diff champ-par-champ vs expected (format _diff_llm)
    llm_latency_ms      INTEGER,
    llm_error           TEXT,

    -- ── Étape Géocodage ─────────────────────────────────────────────────────
    geo_status          TEXT,    -- EXACT_MATCH | STREET_MATCH | QUARTER_DEFAULT | …
    geo_lat             DOUBLE PRECISION,
    geo_lon             DOUBLE PRECISION,
    geo_quartier        TEXT,
    geo_used_fallback   BOOLEAN,
    geo_latency_ms      INTEGER,
    geo_error           TEXT,

    -- ── Étape Dédup ─────────────────────────────────────────────────────────
    dedup_key           TEXT,
    dedup_duplicate_of  TEXT[],  -- liste des case_id (post_id) détectés comme doublons
    dedup_is_duplicate  BOOLEAN,

    CONSTRAINT eval_run_results_run_case_unique UNIQUE (run_id, case_id)
);

CREATE INDEX IF NOT EXISTS idx_eval_run_results_run_id
    ON flatscanner_dev.eval_run_results(run_id);
CREATE INDEX IF NOT EXISTS idx_eval_run_results_case_id
    ON flatscanner_dev.eval_run_results(case_id);

-- ─── Grants (identiques au schéma flatscanner_dev existant) ────────────────

GRANT ALL PRIVILEGES ON flatscanner_dev.eval_datasets    TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON flatscanner_dev.eval_cases       TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON flatscanner_dev.eval_annotations TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON flatscanner_dev.eval_runs        TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON flatscanner_dev.eval_run_results TO anon, authenticated, service_role;
