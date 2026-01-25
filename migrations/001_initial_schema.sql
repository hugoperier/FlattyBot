-- ============================================================
-- FlattyBot Initial Schema
-- Creates FlattyBot tables in the flatscanner schema
-- ============================================================

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS flatscanner;

-- 1. Create users table
CREATE TABLE IF NOT EXISTS flatscanner.users (
    telegram_id BIGINT PRIMARY KEY,
    is_active BOOLEAN DEFAULT TRUE,
    is_paused BOOLEAN DEFAULT FALSE,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    pending_authorization BOOLEAN DEFAULT TRUE,
    authorized_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_interaction TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create user_criteria table
CREATE TABLE IF NOT EXISTS flatscanner.user_criteria (
    user_id BIGINT PRIMARY KEY REFERENCES flatscanner.users(telegram_id),
    criteres_stricts JSONB,
    criteres_confort JSONB,
    description_originale TEXT,
    resume_humain TEXT,
    confiance_extraction NUMERIC,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create sent_alerts table
CREATE TABLE IF NOT EXISTS flatscanner.sent_alerts (
    id SERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES flatscanner.users(telegram_id),
    annonce_id UUID REFERENCES flatscanner.fb_annonces_location(id),
    score_total INTEGER,
    score_criteres_stricts INTEGER,
    score_criteres_confort INTEGER,
    criteres_stricts_matches TEXT[],
    criteres_confort_matches TEXT[],
    badges TEXT[],
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    user_action TEXT,
    UNIQUE(user_id, annonce_id)
);

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_is_active ON flatscanner.users(is_active);
CREATE INDEX IF NOT EXISTS idx_sent_alerts_user_id ON flatscanner.sent_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_sent_alerts_annonce_id ON flatscanner.sent_alerts(annonce_id);

-- 5. Grant permissions to Supabase roles
GRANT USAGE ON SCHEMA flatscanner TO authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA flatscanner TO authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA flatscanner TO authenticated, service_role;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA flatscanner GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA flatscanner GRANT ALL ON SEQUENCES TO authenticated, service_role;
