# PROJ-1: Supabase-Datenmodell & RLS

## Status: Planned
**Created:** 2026-05-15
**Last Updated:** 2026-05-15

## Dependencies
- None

## User Stories
- Als Entwickler möchte ich ein versioniertes Datenbankschema mit allen Kern-Entitäten, damit jedes weitere Feature auf einer stabilen, konsistenten Datengrundlage aufbaut.
- Als Platform-Betreiber möchte ich RLS-Policies auf jeder Tabelle, damit Nutzer ausschließlich ihre eigenen Daten lesen und schreiben können.
- Als Projekt-Mitglied möchte ich, dass meine Kapitel und Projektdaten sicher in Supabase gespeichert werden, damit mein Text zwischen Sessions nicht verloren geht.
- Als Produkt-Owner möchte ich, dass Vapi-Sprechzeit pro Projekt in Sekunden getrackt wird (voice_sessions), damit Nutzer ihr Inklusiv- oder Nachkauf-Kontingent nicht überschreiten können.
- Als Entwickler möchte ich Storage-Buckets für Projekt-Logos, Kapitel-Heros, Cover-Bilder und Exporte, damit Datei-Uploads ein klar definiertes, RLS-gesichertes Ziel haben.
- Als Entwickler möchte ich eine `impulse_catalog`-Tabelle mit 15 vordefinierten Impulstiteln geseedet, damit PROJ-8 (Erzähl-Impulse) von Tag 1 an Daten vorfindet.

## Acceptance Criteria

### Tabellen & Spalten
- [ ] `profiles`: `id` (FK auth.users PK), `full_name` TEXT, `avatar_url` TEXT nullable, `updated_at` TIMESTAMPTZ
- [ ] `projects`: `id` UUID PK, `owner_id` FK profiles, `title` TEXT NOT NULL, `logo_url` TEXT nullable (Storage-Ref), `portal_access_expires_at` TIMESTAMPTZ nullable (NULL bis erster Kauf), `created_at`, `updated_at`
- [ ] `project_members`: `id` UUID PK, `project_id` FK projects ON DELETE CASCADE, `user_id` FK profiles, `role` ENUM(owner, editor), `created_at`; UNIQUE(project_id, user_id)
- [ ] `chapters`: `id` UUID PK, `project_id` FK projects ON DELETE CASCADE, `title` TEXT NOT NULL, `body` JSONB (TipTap-Doc), `hero_image_url` TEXT nullable, `sort_order` INTEGER NOT NULL, `chapter_origin` ENUM(custom, catalog_impulse) NOT NULL DEFAULT 'custom', `source_impulse_id` FK impulse_catalog nullable, `content_version` INTEGER NOT NULL DEFAULT 0, `created_at`, `updated_at`
- [ ] `project_covers`: `id` UUID PK, `project_id` FK projects ON DELETE CASCADE UNIQUE, `theme` TEXT, `image_url` TEXT nullable, `metadata` JSONB, `updated_at`
- [ ] `impulse_catalog`: `id` UUID PK, `title` TEXT NOT NULL, `sort_order` INTEGER NOT NULL, `created_at`
- [ ] `payments`: `id` UUID PK, `project_id` FK projects, `user_id` FK profiles, `stripe_session_id` TEXT UNIQUE NOT NULL, `type` ENUM(initial_portal_access, portal_access_renewal, vapi_voice_minutes_60, print_order), `amount_cents` INTEGER NOT NULL, `currency` TEXT NOT NULL DEFAULT 'eur', `status` ENUM(pending, completed, failed) NOT NULL DEFAULT 'pending', `created_at`
- [ ] `voice_sessions`: `id` UUID PK, `project_id` FK projects, `user_id` FK profiles, `duration_seconds` INTEGER NOT NULL, `chapter_origin` ENUM(custom, catalog_impulse) nullable, `chapter_id` FK chapters nullable, `created_at`
- [ ] `invitations`: `id` UUID PK, `project_id` FK projects ON DELETE CASCADE, `email` TEXT NOT NULL, `role` ENUM(editor) NOT NULL DEFAULT 'editor', `token` TEXT UNIQUE NOT NULL, `accepted_at` TIMESTAMPTZ nullable, `expires_at` TIMESTAMPTZ NOT NULL, `created_at`

### RLS
- [ ] RLS ist auf allen Tabellen aktiviert (kein `FORCE ROW LEVEL SECURITY` nötig, da Default)
- [ ] `profiles`: SELECT/UPDATE nur eigene Zeile (auth.uid() = id)
- [ ] `projects`: SELECT/UPDATE/DELETE wenn Nutzer in project_members; INSERT für authentifizierte Nutzer (Owner-Eintrag via DB-Trigger)
- [ ] `project_members`: SELECT wenn Mitglied desselben Projekts; INSERT/DELETE nur server-seitig (kein direkter Client-Write)
- [ ] `chapters`: SELECT/INSERT/UPDATE/DELETE wenn Nutzer Mitglied des jeweiligen Projekts
- [ ] `project_covers`: SELECT/INSERT/UPDATE wenn Mitglied des Projekts
- [ ] `impulse_catalog`: SELECT für alle authentifizierten Nutzer; kein Client-INSERT/UPDATE/DELETE
- [ ] `payments`: SELECT nur eigene Zeilen (user_id = auth.uid()); kein Client-INSERT/UPDATE
- [ ] `voice_sessions`: SELECT nur eigene Zeilen; kein Client-INSERT/UPDATE
- [ ] `invitations`: SELECT durch Projekt-Mitglied oder durch passende E-Mail-Adresse; kein Client-INSERT/UPDATE

### Storage
- [ ] Bucket `project-logos` existiert (privat; Projekt-Mitglieder: upload + read via signed URL)
- [ ] Bucket `chapter-heroes` existiert (privat; Projekt-Mitglieder: upload + read via signed URL)
- [ ] Bucket `project-covers` existiert (privat; Projekt-Mitglieder: upload + read via signed URL)
- [ ] Bucket `exports` existiert (privat; Projekt-Mitglieder: read; Write nur server-seitig)

### Migrationen & Seed
- [ ] Alle Schema-Änderungen sind versionierte Migration-Dateien unter `supabase/migrations/YYYYMMDDHHMMSS_*.sql`
- [ ] `supabase db reset` läuft auf einem leeren Supabase-Projekt ohne Fehler durch
- [ ] Seed-Datei (`supabase/seed.sql`) befüllt `impulse_catalog` mit den 15 Impulstiteln aus `projektuebersicht-erzaehl-impulse.ts`

### Indexes
- [ ] `chapters(project_id, sort_order)`
- [ ] `project_members(project_id, user_id)` (entspricht UNIQUE-Constraint)
- [ ] `payments(stripe_session_id)` (entspricht UNIQUE-Constraint)
- [ ] `voice_sessions(project_id)`
- [ ] `invitations(token)` (entspricht UNIQUE-Constraint)

### Timestamps
- [ ] Alle Tabellen haben `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- [ ] Alle mutierbaren Tabellen haben `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` mit Auto-Update-Trigger

## Edge Cases
- Ein Nutzer, der kein Mitglied eines Projekts ist, erhält null Zeilen aus allen projektbezogenen Tabellen — RLS liefert 0 Ergebnisse, keinen Fehler
- Löschen eines Projekts kaskadiert zu chapters, project_covers, project_members, invitations — NICHT zu payments oder voice_sessions (Finanz-/Audit-Datensätze bleiben mit orphaned FK erhalten)
- `impulse_catalog`-Zeilen sind über RLS nicht client-seitig löschbar oder änderbar
- Ein Kapitel mit `chapter_origin = catalog_impulse` muss eine gültige `source_impulse_id` referenzieren; NULL ist nur bei `chapter_origin = custom` erlaubt (Constraint auf Applikationsebene, PROJ-8 erzwingt es)
- `invitations.expires_at` wird auf Applikationsebene geprüft (PROJ-9) — das Schema speichert nur den Timestamp, kein DB-Check
- `portal_access_expires_at` ist NULL bis zur ersten abgeschlossenen Stripe-Zahlung (PROJ-6 schreibt den Wert via Webhook); das Schema erlaubt NULL explizit
- `content_version` wird ausschließlich server-seitig inkrementiert; kein Client-Update der Spalte erlaubt
- Migrationen müssen auf einem leeren Projekt ohne manuelle Eingriffe laufen; destruktive Schema-Änderungen erfordern eine eigene versionierte Migration

## Technical Requirements
- Sicherheit: RLS auf jeder Tabelle, keine Ausnahmen; service_role-Key ausschließlich server-seitig
- Storage: alle Buckets privat (kein Public-Access); Client-Zugriff via signierter URL
- `supabase/migrations/` ist in Git eingecheckt; kein Schema-Drift zwischen lokal und Produktion
- Kein Schema-Objekt wird außerhalb von Migrations-Dateien angelegt (kein manuelles SQL in der Supabase-UI)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
