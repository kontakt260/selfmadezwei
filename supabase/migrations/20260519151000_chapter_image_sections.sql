-- ==========================================
-- PROJ-5: Kapitel-Editor (A5, TipTap, Tablet)
-- Schema-Ergänzung: image_sections JSONB + color_page_count INTEGER
-- ==========================================

-- Bild-Sektionen Anfang & Ende mit Layout-Wahl und Bild-Liste.
-- Default: leere Sektionen mit 1-spaltigem Layout.
ALTER TABLE chapters
  ADD COLUMN IF NOT EXISTS image_sections JSONB NOT NULL
    DEFAULT '{"start":{"layout":"1-spaltig","images":[]},"end":{"layout":"1-spaltig","images":[]}}'::jsonb;

-- Anzahl A5-Seiten mit ≥ 1 Bild (client-seitige Schätzung; autoritative
-- Berechnung erfolgt später in PROJ-16 nach PDF-Pagination).
ALTER TABLE chapters
  ADD COLUMN IF NOT EXISTS color_page_count INTEGER NOT NULL DEFAULT 0;

-- Strukturelle Mindest-Validierung: image_sections muss start+end mit
-- erlaubten Layouts haben. Verhindert Garbage-JSON aus Client-Bugs.
ALTER TABLE chapters
  DROP CONSTRAINT IF EXISTS chapters_image_sections_shape;
ALTER TABLE chapters
  ADD CONSTRAINT chapters_image_sections_shape CHECK (
    jsonb_typeof(image_sections->'start') = 'object'
    AND jsonb_typeof(image_sections->'end') = 'object'
    AND (image_sections->'start'->>'layout') IN ('1-spaltig', '2-spaltig')
    AND (image_sections->'end'->>'layout') IN ('1-spaltig', '2-spaltig')
    AND jsonb_typeof(image_sections->'start'->'images') = 'array'
    AND jsonb_typeof(image_sections->'end'->'images') = 'array'
  );

-- color_page_count darf nicht negativ sein.
ALTER TABLE chapters
  DROP CONSTRAINT IF EXISTS chapters_color_page_count_nonneg;
ALTER TABLE chapters
  ADD CONSTRAINT chapters_color_page_count_nonneg CHECK (color_page_count >= 0);
