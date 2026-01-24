-- ============================================================
-- FlattyBot Dev Schema Setup
-- Creates flatscanner_dev schema with all required tables
-- ============================================================

-- 0. Prérequis : Extension PostGIS (si pas déjà active sur la base)
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Création du schéma de développement
CREATE SCHEMA IF NOT EXISTS flatscanner_dev;

-- 2. Création des ENUMS dans le schéma flatscanner_dev
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid 
                   WHERE t.typname = 'post_category' AND n.nspname = 'flatscanner_dev') THEN
        CREATE TYPE flatscanner_dev.post_category AS ENUM (
            'LOCATION_OFFRE',
            'COLOCATION_OFFRE',
            'SOUS_LOCATION',
            'RECHERCHE_LOGEMENT',
            'COLOCATION_RECHERCHE',
            'CHASSEUR_APPART',
            'AUTRE'
        );
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid 
                   WHERE t.typname = 'logement_type' AND n.nspname = 'flatscanner_dev') THEN
        CREATE TYPE flatscanner_dev.logement_type AS ENUM (
            'appartement',
            'studio',
            'duplex',
            'triplex',
            'loft',
            'maison',
            'chambre'
        );
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid 
                   WHERE t.typname = 'etat_logement_type' AND n.nspname = 'flatscanner_dev') THEN
        CREATE TYPE flatscanner_dev.etat_logement_type AS ENUM (
            'neuf',
            'rénové',
            'bon état',
            'à rafraîchir',
            'ancien'
        );
    END IF;
END$$;

-- 3. Fonction utilitaire pour le updated_at
CREATE OR REPLACE FUNCTION flatscanner_dev.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 4. Table des posts Facebook (pour dev - données de test)
CREATE TABLE IF NOT EXISTS flatscanner_dev.facebook_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id TEXT UNIQUE NOT NULL,
    input_data JSONB NOT NULL,
    time_posted TIMESTAMP WITH TIME ZONE NOT NULL,
    
    group_name TEXT NOT NULL,
    categorie flatscanner_dev.post_category NOT NULL,
    confiance NUMERIC(3,2) CHECK (confiance >= 0 AND confiance <= 1) NOT NULL,
    raison_classification TEXT NOT NULL,
    est_offre_location BOOLEAN NOT NULL,
    
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Table des annonces (pour dev - données de test)
CREATE TABLE IF NOT EXISTS flatscanner_dev.fb_annonces_location (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    facebook_post_id UUID NOT NULL REFERENCES flatscanner_dev.facebook_posts(id) ON DELETE CASCADE,
    image_path TEXT,
    
    -- Données extraites par l'IA (brutes)
    adresse_complete TEXT,
    rue TEXT,
    numero_rue TEXT,
    ville TEXT,
    code_postal VARCHAR(4) CHECK (code_postal ~ '^[0-9]{4}$'),
    quartier TEXT,

    -- ENRICHISSEMENT API SITG / GEOCODAGE
    geocode_processed BOOLEAN DEFAULT FALSE,
    geocode_query TEXT,
    geocode_status TEXT,
    geocode_response JSONB,
    geocode_score NUMERIC(5,2),
    geocode_geom geometry(Point, 4326),
    geocoded_at TIMESTAMP WITH TIME ZONE,
    
    -- Caractéristiques
    nombre_pieces NUMERIC(3,1) CHECK (nombre_pieces >= 0.5 AND nombre_pieces <= 20),
    type_logement flatscanner_dev.logement_type,
    surface_m2 NUMERIC(6,2) CHECK (surface_m2 >= 10 AND surface_m2 <= 1000),
    etage TEXT,
    dernier_etage BOOLEAN,
    nombre_chambres INTEGER CHECK (nombre_chambres >= 0),
    nombre_sdb INTEGER CHECK (nombre_sdb >= 0),
    nombre_wc INTEGER CHECK (nombre_wc >= 0),
    
    -- Équipements
    balcon BOOLEAN,
    terrasse BOOLEAN,
    jardin BOOLEAN,
    cave BOOLEAN,
    meuble BOOLEAN DEFAULT false NOT NULL,
    cuisine_equipee BOOLEAN,
    lave_vaisselle BOOLEAN,
    lave_linge BOOLEAN,
    seche_linge BOOLEAN,
    ascenseur BOOLEAN,
    climatisation BOOLEAN,
    
    -- Finances
    loyer_mensuel NUMERIC(10,2) CHECK (loyer_mensuel >= 0),
    charges_mensuelles NUMERIC(10,2) CHECK (charges_mensuelles >= 0),
    loyer_total NUMERIC(10,2) CHECK (loyer_total >= 0),
    parking_inclus BOOLEAN,
    parking_prix NUMERIC(10,2) CHECK (parking_prix >= 0),
    caution NUMERIC(10,2) CHECK (caution >= 0),
    revenu_minimum NUMERIC(10,2) CHECK (revenu_minimum >= 0),
    
    -- Divers
    date_disponibilite DATE,
    date_immediat BOOLEAN,
    visite_prevue TEXT,
    contact_info TEXT,
    etat_logement flatscanner_dev.etat_logement_type,
    urgence BOOLEAN,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(facebook_post_id)
);

-- 6. FlattyBot specific tables (users, user_criteria, sent_alerts)

CREATE TABLE IF NOT EXISTS flatscanner_dev.users (
    telegram_id BIGINT PRIMARY KEY,
    is_active BOOLEAN DEFAULT TRUE,
    is_paused BOOLEAN DEFAULT FALSE,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    pending_authorization BOOLEAN DEFAULT TRUE,
    authorized_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_interaction TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flatscanner_dev.user_criteria (
    user_id BIGINT PRIMARY KEY REFERENCES flatscanner_dev.users(telegram_id),
    criteres_stricts JSONB,
    criteres_confort JSONB,
    description_originale TEXT,
    resume_humain TEXT,
    confiance_extraction NUMERIC,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flatscanner_dev.sent_alerts (
    id SERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES flatscanner_dev.users(telegram_id),
    annonce_id UUID REFERENCES flatscanner_dev.fb_annonces_location(id),
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

-- 7. Indexes

-- Facebook Posts indexes
CREATE INDEX IF NOT EXISTS idx_facebook_posts_post_id ON flatscanner_dev.facebook_posts(post_id);
CREATE INDEX IF NOT EXISTS idx_facebook_posts_time_posted ON flatscanner_dev.facebook_posts(time_posted DESC);
CREATE INDEX IF NOT EXISTS idx_facebook_posts_categorie ON flatscanner_dev.facebook_posts(categorie);
CREATE INDEX IF NOT EXISTS idx_facebook_posts_input_data ON flatscanner_dev.facebook_posts USING GIN (input_data);

-- Annonces indexes
CREATE INDEX IF NOT EXISTS idx_fb_annonces_location_fk ON flatscanner_dev.fb_annonces_location(facebook_post_id);
CREATE INDEX IF NOT EXISTS idx_fb_annonces_location_ville ON flatscanner_dev.fb_annonces_location(ville);
CREATE INDEX IF NOT EXISTS idx_fb_annonces_location_loyer ON flatscanner_dev.fb_annonces_location(loyer_mensuel);
CREATE INDEX IF NOT EXISTS idx_fb_annonces_location_pieces ON flatscanner_dev.fb_annonces_location(nombre_pieces);
CREATE INDEX IF NOT EXISTS idx_fb_annonces_location_geom ON flatscanner_dev.fb_annonces_location USING GIST (geocode_geom);

-- FlattyBot indexes
CREATE INDEX IF NOT EXISTS idx_users_is_active ON flatscanner_dev.users(is_active);
CREATE INDEX IF NOT EXISTS idx_sent_alerts_user_id ON flatscanner_dev.sent_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_sent_alerts_annonce_id ON flatscanner_dev.sent_alerts(annonce_id);

-- 8. Trigger de mise à jour
DROP TRIGGER IF EXISTS update_fb_annonces_location_updated_at ON flatscanner_dev.fb_annonces_location;
CREATE TRIGGER update_fb_annonces_location_updated_at
    BEFORE UPDATE ON flatscanner_dev.fb_annonces_location
    FOR EACH ROW
    EXECUTE FUNCTION flatscanner_dev.update_updated_at_column();

-- 9. Grant permissions to Supabase roles
GRANT USAGE ON SCHEMA flatscanner_dev TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA flatscanner_dev TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA flatscanner_dev TO anon, authenticated, service_role;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA flatscanner_dev GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA flatscanner_dev GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
