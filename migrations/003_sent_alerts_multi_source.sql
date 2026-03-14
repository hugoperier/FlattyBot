-- Extend sent_alerts to support multiple ad sources (Facebook + MKSA)
-- Allows per-user deduplication for MKSA ads same as Facebook.
--
-- Schema: flatscanner_dev (dev). For prod (e.g. flatscanner), run the same
-- statements with your schema name, or set search_path before running.

-- 1. Add source column (default 'facebook' for existing rows)
ALTER TABLE flatscanner_dev.sent_alerts
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'facebook';

-- 2. Drop FK so annonce_id can store UUIDs from mksa_annonces too
ALTER TABLE flatscanner_dev.sent_alerts
    DROP CONSTRAINT IF EXISTS sent_alerts_annonce_id_fkey;

-- 3. Drop old unique, add new (user_id, source, annonce_id)
ALTER TABLE flatscanner_dev.sent_alerts
    DROP CONSTRAINT IF EXISTS sent_alerts_user_id_annonce_id_key;

ALTER TABLE flatscanner_dev.sent_alerts
    ADD CONSTRAINT sent_alerts_user_source_annonce_unique UNIQUE (user_id, source, annonce_id);

-- 4. Index for lookups by (user_id, source, annonce_id)
CREATE INDEX IF NOT EXISTS idx_sent_alerts_user_source_annonce
    ON flatscanner_dev.sent_alerts(user_id, source, annonce_id);
