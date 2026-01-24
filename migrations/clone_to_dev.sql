-- ============================================================
-- Clone data from flatscanner to flatscanner_dev
-- Run this in Supabase SQL Editor AFTER running 000_create_dev_schema.sql
-- ============================================================

-- 1. Clone facebook_posts
INSERT INTO flatscanner_dev.facebook_posts (
    id,
    post_id,
    input_data,
    time_posted,
    group_name,
    categorie,
    confiance,
    raison_classification,
    est_offre_location,
    processed_at,
    created_at
)
SELECT 
    id,
    post_id,
    input_data,
    time_posted,
    group_name,
    categorie::text::flatscanner_dev.post_category,  -- Cast enum between schemas
    confiance,
    raison_classification,
    est_offre_location,
    processed_at,
    created_at
FROM flatscanner.facebook_posts
ON CONFLICT (id) DO NOTHING;

-- 2. Clone fb_annonces_location
INSERT INTO flatscanner_dev.fb_annonces_location (
    id,
    facebook_post_id,
    image_path,
    adresse_complete,
    rue,
    numero_rue,
    ville,
    code_postal,
    quartier,
    geocode_processed,
    geocode_query,
    geocode_status,
    geocode_response,
    geocode_score,
    geocode_geom,
    geocoded_at,
    nombre_pieces,
    type_logement,
    surface_m2,
    etage,
    dernier_etage,
    nombre_chambres,
    nombre_sdb,
    nombre_wc,
    balcon,
    terrasse,
    jardin,
    cave,
    meuble,
    cuisine_equipee,
    lave_vaisselle,
    lave_linge,
    seche_linge,
    ascenseur,
    climatisation,
    loyer_mensuel,
    charges_mensuelles,
    loyer_total,
    parking_inclus,
    parking_prix,
    caution,
    revenu_minimum,
    date_disponibilite,
    date_immediat,
    visite_prevue,
    contact_info,
    etat_logement,
    urgence,
    created_at,
    updated_at
)
SELECT 
    id,
    facebook_post_id,
    image_path,
    adresse_complete,
    rue,
    numero_rue,
    ville,
    code_postal,
    quartier,
    geocode_processed,
    geocode_query,
    geocode_status,
    geocode_response,
    geocode_score,
    geocode_geom,
    geocoded_at,
    nombre_pieces,
    type_logement::text::flatscanner_dev.logement_type,  -- Cast enum between schemas
    surface_m2,
    etage,
    dernier_etage,
    nombre_chambres,
    nombre_sdb,
    nombre_wc,
    balcon,
    terrasse,
    jardin,
    cave,
    meuble,
    cuisine_equipee,
    lave_vaisselle,
    lave_linge,
    seche_linge,
    ascenseur,
    climatisation,
    loyer_mensuel,
    charges_mensuelles,
    loyer_total,
    parking_inclus,
    parking_prix,
    caution,
    revenu_minimum,
    date_disponibilite,
    date_immediat,
    visite_prevue,
    contact_info,
    etat_logement::text::flatscanner_dev.etat_logement_type,  -- Cast enum between schemas
    urgence,
    created_at,
    updated_at
FROM flatscanner.fb_annonces_location
ON CONFLICT (id) DO NOTHING;

-- 3. Verify counts
SELECT 
    'facebook_posts' as table_name,
    (SELECT COUNT(*) FROM flatscanner.facebook_posts) as source_count,
    (SELECT COUNT(*) FROM flatscanner_dev.facebook_posts) as dev_count
UNION ALL
SELECT 
    'fb_annonces_location',
    (SELECT COUNT(*) FROM flatscanner.fb_annonces_location),
    (SELECT COUNT(*) FROM flatscanner_dev.fb_annonces_location);
