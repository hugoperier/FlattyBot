-- ============================================================
-- Migration 006 — Confiance par-champ sur eval_annotations
-- Target schema: flatscanner_dev
-- Pour la prod, remplacer toutes les occurrences de flatscanner_dev par flatscanner
-- ============================================================
--
-- Ajoute une colonne `confidence` JSONB à eval_annotations.
--
-- L'annotateur (Opus) y stocke sa confiance PAR CHAMP, en catégoriel :
--   { "categorie": "high", "loyer_total": "medium", "expected_zones": "low" }
--   valeurs : 'high' | 'medium' | 'low'
--
-- Usage : la file de relecture trie par confiance × désaccord — un désaccord
-- SUT/vérité-terrain à haute confiance est un probable VRAI bug du SUT ; à basse
-- confiance, c'est plutôt un post ambigu. Voir docs/adr/0001 (FlatScanner).
-- ============================================================

ALTER TABLE flatscanner_dev.eval_annotations
    ADD COLUMN IF NOT EXISTS confidence JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN flatscanner_dev.eval_annotations.confidence IS
    'Confiance par-champ de l''annotateur : {field: high|medium|low}. '
    'Utilisée pour trier la file de relecture (confiance × désaccord).';
