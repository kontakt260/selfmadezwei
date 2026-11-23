-- PROJ-30: Wortzahl je Kapitel.
--
-- Die Projektuebersicht musste bisher alle Kapiteltexte laden, nur um die Woerter
-- zu zaehlen. Jetzt speichert der Server die Zahl beim Speichern mit.
--
-- word_count
--   Leer bedeutet "noch nicht gezaehlt". Die Uebersicht zaehlt dann nur dieses
--   eine Kapitel live. Bestehende Kapitel werden bewusst nicht umgeschrieben,
--   damit ihr Datum "zuletzt bearbeitet" erhalten bleibt.
--
-- Schutzregel
--   Aendert sich der Text ohne neue Zaehlung, wird die Zahl geleert. So kann
--   auch ein spaeterer Schreibweg keine falsche Zahl hinterlassen.
--
-- RLS und Rechte bleiben unveraendert. Die Zahl ist reine Anzeige.

ALTER TABLE public.chapters
  ADD COLUMN word_count INTEGER;

ALTER TABLE public.chapters
  ADD CONSTRAINT chapters_word_count_check
    CHECK (word_count IS NULL OR word_count BETWEEN 0 AND 10000000);

COMMENT ON COLUMN public.chapters.word_count IS
  'PROJ-30: Woerter im Kapiteltext. NULL bedeutet noch nicht gezaehlt.';

CREATE FUNCTION private.clear_stale_word_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.body IS DISTINCT FROM OLD.body
     AND NEW.word_count IS NOT DISTINCT FROM OLD.word_count THEN
    NEW.word_count := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.clear_stale_word_count() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER chapters_clear_stale_word_count
  BEFORE UPDATE OF body ON public.chapters
  FOR EACH ROW
  EXECUTE FUNCTION private.clear_stale_word_count();
