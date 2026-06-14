-- Widen fb_annonces_location.code_postal to accept French postal codes (5 digits).
-- The product covers Grand Genève / France voisine (Annemasse, Gaillard, …), whose
-- postal codes are 5 digits and overflowed the original VARCHAR(4) Swiss-only column,
-- crashing the enricher with "value too long for character varying(4)" (22001).
--
-- Schema: flatscanner_dev (dev). For prod (flatscanner), run the same statements
-- with your schema name, or set search_path before running.

-- 1. Drop the old 4-digit-only CHECK
ALTER TABLE flatscanner_dev.fb_annonces_location
    DROP CONSTRAINT IF EXISTS fb_annonces_location_code_postal_check;

-- 2. Widen the column to hold 5-digit French codes
ALTER TABLE flatscanner_dev.fb_annonces_location
    ALTER COLUMN code_postal TYPE VARCHAR(5);

-- 3. Re-add the CHECK, now allowing 4 (CH) or 5 (FR) digits
ALTER TABLE flatscanner_dev.fb_annonces_location
    ADD CONSTRAINT fb_annonces_location_code_postal_check
    CHECK (code_postal ~ '^[0-9]{4,5}$');
