-- Create users table
CREATE TABLE IF NOT EXISTS users (
    telegram_id BIGINT PRIMARY KEY,
    is_active BOOLEAN DEFAULT TRUE,
    is_paused BOOLEAN DEFAULT FALSE,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_interaction TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_criteria table
CREATE TABLE IF NOT EXISTS user_criteria (
    user_id BIGINT PRIMARY KEY REFERENCES users(telegram_id),
    criteres_stricts JSONB,
    criteres_confort JSONB,
    description_originale TEXT,
    resume_humain TEXT,
    confiance_extraction NUMERIC,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create sent_alerts table
CREATE TABLE IF NOT EXISTS sent_alerts (
    id SERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(telegram_id),
    annonce_id UUID REFERENCES fb_annonces_location(id),
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_sent_alerts_user_id ON sent_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_sent_alerts_annonce_id ON sent_alerts(annonce_id);
