-- ==========================================
-- PROJ-8: Erzähl-Impulse — Katalog erweitern
-- ==========================================
--
-- Erweitert impulse_catalog um zwei neue Spalten + befüllt die 15
-- Bestands-Reihen mit den Inhalten aus dem Frontend-Mock
-- (src/lib/projektuebersicht-erzaehl-impulse.ts).
--
-- Spec-Felder:
--   leading_questions  TEXT[]  — mindestens 1 Eintrag (CHECK), keine
--                                 harte Obergrenze (Pflege-Konvention bis ~4)
--   category           TEXT    — frei pflegbar, Liste im Frontend-Mock
--                                 dokumentiert (kein DB-Enum, siehe Tech-
--                                 Design Punkt 2)
--
-- RLS bleibt unverändert: nur SELECT für authenticated. Writes nur via
-- service_role (= Migrationen).

-- ──────────────────────────────────────────────────────────────────────
-- 1. Spalten anlegen (zunächst NULL erlaubt für den Backfill-Schritt)
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE impulse_catalog
  ADD COLUMN IF NOT EXISTS leading_questions TEXT[];

ALTER TABLE impulse_catalog
  ADD COLUMN IF NOT EXISTS category TEXT;

-- ──────────────────────────────────────────────────────────────────────
-- 2. Backfill der 15 Bestands-Reihen
-- ──────────────────────────────────────────────────────────────────────
-- Quelle: Frontend-Mock vom 2026-05-21. Matching via title-Spalte.

UPDATE impulse_catalog SET
  category = 'Kindheit',
  leading_questions = ARRAY[
    'Was ist deine früheste Erinnerung?',
    'Welche Gerüche oder Geräusche aus deiner Kindheit kommen dir sofort in den Sinn?',
    'Welches Spielzeug oder Spiel war dir besonders wichtig?',
    'Wer hat dir in jungen Jahren am meisten Geborgenheit gegeben?'
  ]
WHERE title = 'Kindheit und erste Erinnerungen';

UPDATE impulse_catalog SET
  category = 'Familie',
  leading_questions = ARRAY[
    'Wie haben sich deine Eltern kennengelernt?',
    'Welche Eigenschaften deiner Mutter erkennst du heute in dir wieder?',
    'Was hat dein Vater dir mitgegeben — bewusst oder unbewusst?',
    'Welche Geschichte aus dem Leben deiner Eltern erzählst du am liebsten weiter?'
  ]
WHERE title = 'Meine Eltern und ihre Geschichte';

UPDATE impulse_catalog SET
  category = 'Bildung',
  leading_questions = ARRAY[
    'Welche Lehrerin oder welcher Lehrer hat dich besonders geprägt — im Guten oder im Schlechten?',
    'Wann hast du dich in der Schule zum ersten Mal richtig wohl gefühlt?',
    'Welches Schulfach war dir am wichtigsten — und warum?',
    'Wie hast du dich für deinen Berufsweg entschieden?'
  ]
WHERE title = 'Schule, Ausbildung und prägende Lehrer';

UPDATE impulse_catalog SET
  category = 'Beziehungen',
  leading_questions = ARRAY[
    'Wer war deine erste große Liebe?',
    'Wie habt ihr euch kennengelernt — und wie habt ihr euch wieder verloren?',
    'Welche Freundschaft aus jungen Jahren hat bis heute gehalten?',
    'Was hast du über dich selbst durch andere Menschen gelernt?'
  ]
WHERE title = 'Erste große Liebe und Freundschaften';

UPDATE impulse_catalog SET
  category = 'Beruf',
  leading_questions = ARRAY[
    'Was war dein erster Job — und wie hat er dich verändert?',
    'Welche berufliche Entscheidung hat dein Leben am stärksten beeinflusst?',
    'Wer war ein Mentor oder Vorbild auf deinem beruflichen Weg?',
    'Was würdest du deinem 25-jährigen Ich heute raten?'
  ]
WHERE title = 'Berufseinstieg und wichtige Stationen';

UPDATE impulse_catalog SET
  category = 'Lebensphasen',
  leading_questions = ARRAY[
    'Gab es einen Moment, in dem alles plötzlich anders war?',
    'Hast du den Wendepunkt damals als solchen erkannt — oder erst im Rückblick?',
    'Wer oder was hat dir geholfen, ihn zu meistern?',
    'Was wäre aus deinem Leben geworden, wenn du anders entschieden hättest?'
  ]
WHERE title = 'Ein Wendepunkt in meinem Leben';

UPDATE impulse_catalog SET
  category = 'Erfahrungen',
  leading_questions = ARRAY[
    'Welche Reise hast du nie vergessen?',
    'Welche Begegnung mit einem Fremden hat dich am meisten berührt?',
    'Wo hast du zum ersten Mal das Gefühl gehabt, dich selbst zu finden?',
    'Welches Land oder welche Stadt würdest du gerne noch einmal besuchen?'
  ]
WHERE title = 'Reisen und Begegnungen, die mich geprägt haben';

UPDATE impulse_catalog SET
  category = 'Familie',
  leading_questions = ARRAY[
    'Wie hat sich dein Leben mit der Geburt deines ersten Kindes verändert?',
    'Welche Werte wolltest du unbedingt weitergeben?',
    'Welche Momente mit deinen Kindern oder Enkeln möchtest du nie vergessen?',
    'Was wünschst du dir für deren Zukunft?'
  ]
WHERE title = 'Familie gründen — Kinder und Enkel';

UPDATE impulse_catalog SET
  category = 'Lebensphasen',
  leading_questions = ARRAY[
    'Welche Phase in deinem Leben war die schwerste — und wie bist du da rausgekommen?',
    'Was hat dir Mut gemacht, wenn alles aussichtslos schien?',
    'Welche Krise hat dich rückblickend stärker gemacht?',
    'Wer war an deiner Seite, als du ihn am meisten gebraucht hast?'
  ]
WHERE title = 'Herausforderungen, die ich gemeistert habe';

UPDATE impulse_catalog SET
  category = 'Werte',
  leading_questions = ARRAY[
    'Was zählt für dich heute mehr als noch vor 20 Jahren?',
    'Welche Person oder Sache würdest du auf keinen Fall mehr aufgeben wollen?',
    'Wie hat sich dein Verständnis von Glück verändert?',
    'Wofür stehst du heute morgens am liebsten auf?'
  ]
WHERE title = 'Was mir heute am wichtigsten ist';

UPDATE impulse_catalog SET
  category = 'Familie',
  leading_questions = ARRAY[
    'Welche Tradition aus deiner Kindheit lebst du noch heute?',
    'Welches Fest war jedes Jahr ein besonderes Ereignis?',
    'Gibt es ein Familienrezept, das eine Geschichte erzählt?',
    'Welche eigene Tradition hast du in deiner Familie begründet?'
  ]
WHERE title = 'Traditionen und Feste in unserer Familie';

UPDATE impulse_catalog SET
  category = 'Beziehungen',
  leading_questions = ARRAY[
    'An wen denkst du gerade — und warum?',
    'Was hat dich an diesem Menschen besonders beeindruckt?',
    'Welches Erlebnis mit ihm oder ihr trägst du wie einen Schatz in dir?',
    'Was würdest du ihm oder ihr heute gerne noch sagen?'
  ]
WHERE title = 'Ein Mensch, der mir besonders viel bedeutet hat';

UPDATE impulse_catalog SET
  category = 'Heimat',
  leading_questions = ARRAY[
    'Welcher Ort hat sich für dich am meisten wie Heimat angefühlt?',
    'Wie hast du dir zum ersten Mal ein Zuhause selbst eingerichtet?',
    'Welches Haus oder welche Wohnung würdest du jederzeit zurückbekommen wollen?',
    'Wo möchtest du am liebsten alt werden — und warum dort?'
  ]
WHERE title = 'Mein Zuhause und Orte, an denen ich gelebt habe';

UPDATE impulse_catalog SET
  category = 'Werte',
  leading_questions = ARRAY[
    'Was machst du, wenn du die Zeit ganz vergisst?',
    'Welche Leidenschaft begleitet dich schon dein ganzes Leben?',
    'Gibt es etwas, das du gerne gelernt hättest — und das du jetzt noch beginnen könntest?',
    'Was wünschst du dir mehr in deinem Alltag?'
  ]
WHERE title = 'Hobbys, Leidenschaften und was mir Freude bereitet';

UPDATE impulse_catalog SET
  category = 'Werte',
  leading_questions = ARRAY[
    'Welcher Rat hat dir selbst am meisten geholfen?',
    'Welche Fehler würdest du der nächsten Generation gerne ersparen?',
    'Was wünschst du deinen Kindern und Enkeln für ihre Zukunft?',
    'Welcher Gedanke darf nicht verloren gehen, wenn du einmal nicht mehr da bist?'
  ]
WHERE title = 'Ratschläge und Wünsche an die nächste Generation';

-- ──────────────────────────────────────────────────────────────────────
-- 3. NOT NULL + CHECK-Constraints aktivieren
-- ──────────────────────────────────────────────────────────────────────
-- Nach erfolgreichem Backfill müssen alle Reihen die neuen Pflichten erfüllen.

ALTER TABLE impulse_catalog
  ALTER COLUMN leading_questions SET NOT NULL;

ALTER TABLE impulse_catalog
  ALTER COLUMN category SET NOT NULL;

ALTER TABLE impulse_catalog
  DROP CONSTRAINT IF EXISTS impulse_catalog_leading_questions_nonempty;
ALTER TABLE impulse_catalog
  ADD CONSTRAINT impulse_catalog_leading_questions_nonempty
  CHECK (cardinality(leading_questions) >= 1);

-- Kategorie darf nicht leer string sein (Whitespace-trimmt prüfen).
ALTER TABLE impulse_catalog
  DROP CONSTRAINT IF EXISTS impulse_catalog_category_nonempty;
ALTER TABLE impulse_catalog
  ADD CONSTRAINT impulse_catalog_category_nonempty
  CHECK (length(trim(category)) > 0);
