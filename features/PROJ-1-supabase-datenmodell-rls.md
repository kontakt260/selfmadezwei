# PROJ-1: Supabase-Datenmodell & RLS

## Status: In Progress
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
- [ ] `project_members`: `id` UUID PK, `project_id` FK projects ON DELETE CASCADE, `user_id` FK profiles, `role` ENUM(projektleiter, co_author), `created_at`; UNIQUE(project_id, user_id); nur `projektleiter` darf Projekt löschen und finalen Druckauftrag erteilen; mehrere Projektleiter pro Projekt erlaubt
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

### Übersicht
PROJ-1 ist ein reines Infrastruktur-Feature — keine UI, keine API-Routen. Das Ergebnis ist ein versioniertes, vollständig in Git eingechecktes Datenbankschema, das alle folgenden Features als stabile Grundlage nutzt.

### Was wird gebaut

```
supabase/
  migrations/
    20260515000000_initial_schema.sql   ← ENUMs, 9 Tabellen, Indizes, updated_at-Trigger
    20260515000001_rls_policies.sql     ← RLS aktivieren + alle Policies auf 9 Tabellen
    20260515000002_storage.sql          ← 4 private Buckets + Storage-Policies
  seed.sql                              ← 15 Erzähl-Impulse für impulse_catalog
src/lib/
  database.types.ts                     ← Auto-generierte TypeScript-Typen (via Supabase MCP)
  supabase.ts                           ← Supabase-Client (anon key; Platzhalter wird aktiviert)
```

> **Dev-Workflow:** Kein lokaler Supabase-Stack, keine CLI-Installation. Migrations werden via Supabase MCP-Tool direkt gegen das Remote-Projekt angewendet. TypeScript-Typen werden ebenfalls via MCP generiert. Die Migrations-Dateien in Git bleiben die Quelle der Wahrheit.

### Datenmodell (9 Tabellen)

**Nutzer & Zugang**
- `profiles` — Erweiterung des Supabase-Auth-Eintrags; wird via DB-Trigger automatisch bei Registrierung angelegt
- `project_members` — zentrale Berechtigungstabelle: wer hat in welcher Rolle Zugang zu welchem Projekt (projektleiter / co_author)
- `invitations` — offene Einladungen (token-basiert, mit Ablaufdatum); Annahme-Logik in PROJ-9

**Inhalt**
- `projects` — das Buchprojekt (Titel, Logo-Referenz, Portal-Zugangs-Ablaufdatum)
- `chapters` — Kapitel mit TipTap-Inhalt (JSONB), Sortierung, Bild-Referenz, Ursprung (manuell oder Impuls)
- `project_covers` — Buchcover-Design pro Projekt (1:1-Relation zu `projects`)
- `impulse_catalog` — die 15 vordefinierten Erzähl-Impulse; read-only, per Seed befüllt

**Abrechnung & Nutzung**
- `payments` — abgeschlossene Stripe-Transaktionen; Idempotenz via UNIQUE auf `stripe_session_id`
- `voice_sessions` — Vapi-Anrufe pro Projekt; `duration_seconds` als Basis für Sprechzeit-Berechnung

### 4 PostgreSQL-ENUMs

| ENUM | Werte |
|------|-------|
| `member_role` | projektleiter, co_author |
| `chapter_origin` | custom, catalog_impulse |
| `payment_type` | initial_portal_access, portal_access_renewal, vapi_voice_minutes_60, print_order |
| `payment_status` | pending, completed, failed |

### Autorisierungs-Logik (RLS)

Die zentrale Frage jeder Policy: **"Ist dieser Nutzer Mitglied des Projekts, zu dem diese Zeile gehört?"** Die `project_members`-Tabelle ist die einzige Wahrheitsquelle für Zugriffsrechte.

Besondere Fälle:
- `profiles` — nur eigene Zeile lesbar/schreibbar (kein Projektbezug)
- `payments` / `voice_sessions` — nur eigene Zeilen lesbar; kein Client-Write erlaubt
- `impulse_catalog` — alle authentifizierten Nutzer lesen; kein Write
- `invitations` — lesbar für Projektmitglieder ODER für den Nutzer, dessen E-Mail mit der Einladung übereinstimmt

Server-seitige Operationen (Stripe-Webhook, Auth-Trigger) nutzen den `service_role`-Key und umgehen RLS vollständig. So werden Projekte und Payments ohne Client-Write-Berechtigung angelegt.

### Storage-Architektur

4 private Buckets — kein Public-Access; alle Dateien über zeitlich begrenzte Signed URLs:

| Bucket | Upload | Lesen |
|--------|--------|-------|
| `project-logos` | Projektmitglieder | Projektmitglieder (Signed URL) |
| `chapter-heroes` | Projektmitglieder | Projektmitglieder (Signed URL) |
| `project-covers` | Projektmitglieder | Projektmitglieder (Signed URL) |
| `exports` | Nur Server | Projektmitglieder (Signed URL) |

### Migrations-Strategie

- 3 Migrations-Dateien in fester Reihenfolge: Schema → RLS-Policies → Storage
- Migrations werden via Supabase MCP-Tool direkt gegen das Remote-Projekt angewendet
- Kein Schema-Objekt außerhalb von Migrations-Dateien — kein manuelles SQL in der Supabase-UI
- Zukünftige Ergänzungen (z. B. `chapters.color_page_count` aus PROJ-5) erhalten jeweils eine eigene nummerierte Migrations-Datei

### TypeScript-Typen

Nach jeder Migration wird `src/lib/database.types.ts` via Supabase MCP (`generate_typescript_types`) neu generiert. Alle Server Actions und API-Routen importieren diese Typen — kein manuelles Tippen von Datenbankstrukturen.

### Benötigte Pakete

| Paket | Zweck | Status |
|-------|-------|--------|
| `@supabase/supabase-js` | Supabase-Client | ✓ installiert |
| `@supabase/ssr` | SSR-fähiger Client für Next.js App Router (Cookie-Auth) | Noch nicht installiert — wird in PROJ-2 benötigt, kann bereits in PROJ-1 installiert werden |

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
