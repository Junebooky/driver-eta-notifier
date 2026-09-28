-- ==============================================================================
-- Protocol Cockpit: Add full_name and updated_at to presets
-- Purpose: Persist customized display names ('SGBAC') alongside full names ('서울김포비즈니스항공센터')
-- Date: 2026-09-28
-- ==============================================================================

ALTER TABLE IF EXISTS cockpit.presets 
ADD COLUMN IF NOT EXISTS full_name TEXT NULL,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE cockpit.presets 
SET full_name = name 
WHERE full_name IS NULL;

CREATE OR REPLACE VIEW cockpit.cockpit_presets AS 
SELECT * FROM cockpit.presets;
