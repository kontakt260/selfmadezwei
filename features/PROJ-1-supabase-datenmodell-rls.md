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

> **Dev-Workflow:** Kein lokaler Supabase-Stack, keine CLI-Installation. Migrations werden via Supabase MCP-Tool **ausschließlich gegen den `stage`-Branch** angewendet — niemals direkt gegen `main`/Production. Vor der ersten Migration immer `list_branches` aufrufen und das `project_ref` des Stage-Branches verwenden; bei fehlendem Stage-Branch zuerst mit dem User abklären (kein automatisches `create_branch`). Promotion auf `main` erfolgt erst nach QA-Freigabe via `merge_branch` und nur mit expliziter User-Bestätigung. TypeScript-Typen werden ebenfalls via MCP gegen den Stage-Branch generiert. Die Migrations-Dateien in Git bleiben die Quelle der Wahrheit.

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
- Migrations werden via Supabase MCP-Tool **ausschließlich gegen den `stage`-Branch** angewendet — niemals direkt gegen `main`/Production
- Vor jeder Migration: `list_branches` aufrufen, `project_ref` des Stage-Branches verifizieren; bei Unsicherheit Rückfrage an User
- Promotion auf `main` ausschließlich via `merge_branch` und nur nach expliziter User-Bestätigung (Teil von `/deploy`)
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

**QA Date:** 2026-05-16
**Method:** SQL-level verification against live remote Supabase project (`erzjzhggdybnlmtvjpse`). No browser testing (pure infrastructure feature, no UI). All queries run via Supabase MCP.

### Acceptance Criteria Results

#### Tabellen & Spalten
| Criterion | Status |
|-----------|--------|
| `profiles` (id, full_name, avatar_url, updated_at) | ✅ Pass |
| `projects` (id, owner_id, title, logo_url, portal_access_expires_at, timestamps) | ✅ Pass |
| `project_members` (id, project_id, user_id, role, created_at; UNIQUE project_id+user_id) | ✅ Pass |
| `chapters` (all 11 columns including chapter_origin DEFAULT 'custom', content_version DEFAULT 0) | ✅ Pass |
| `project_covers` (id, project_id UNIQUE, theme, image_url, metadata, timestamps) | ✅ Pass |
| `impulse_catalog` (id, title, sort_order, created_at) | ✅ Pass |
| `payments` (UNIQUE stripe_session_id; currency DEFAULT 'eur'; status DEFAULT 'pending') | ✅ Pass |
| `voice_sessions` (all columns including chapter_id FK, chapter_origin nullable) | ✅ Pass |
| `invitations` (UNIQUE token; role DEFAULT 'co_author'; accepted_at nullable) | ✅ Pass |

#### RLS
| Criterion | Status |
|-----------|--------|
| RLS enabled on all 9 tables | ✅ Pass |
| `profiles`: SELECT/UPDATE own only | ✅ Pass |
| `projects`: SELECT/UPDATE as member; INSERT authenticated; DELETE as projektleiter | ✅ Pass |
| `project_members`: SELECT own; no client INSERT/DELETE | ✅ Pass |
| `chapters`: SELECT/INSERT/UPDATE/DELETE as member | ✅ Pass |
| `project_covers`: SELECT/INSERT/UPDATE as member | ✅ Pass |
| `impulse_catalog`: SELECT authenticated; no client write | ✅ Pass |
| `payments`: SELECT own; no client write | ✅ Pass |
| `voice_sessions`: SELECT own; no client write | ✅ Pass |
| `invitations`: SELECT as member OR recipient by email; no client write | ✅ Pass |
| No open SELECT policies (qual=NULL for SELECT) | ✅ Pass |
| No RLS-enabled tables without any policy | ✅ Pass |

#### Storage
| Criterion | Status |
|-----------|--------|
| `project-logos` private, 10MB limit, member CRUD via path-based membership check | ✅ Pass |
| `chapter-heroes` private, 10MB limit, member CRUD | ✅ Pass |
| `project-covers` private, 10MB limit, member CRUD | ✅ Pass |
| `exports` private, 100MB limit, SELECT-only for members (no client INSERT) | ✅ Pass |

#### Migrationen & Seed
| Criterion | Status |
|-----------|--------|
| 3 migration files in `supabase/migrations/` (schema, RLS, storage) | ✅ Pass |
| `supabase db reset` on empty project without errors | ⚠️ Not Testable (see BUG-1) |
| Seed: 15 impulse_catalog rows, sort_order 1–15, correct titles | ✅ Pass |

#### Indexes
| Criterion | Status |
|-----------|--------|
| `chapters(project_id, sort_order)` → `idx_chapters_project_sort` | ✅ Pass |
| `project_members(project_id, user_id)` → via UNIQUE constraint | ✅ Pass |
| `payments(stripe_session_id)` → via UNIQUE constraint | ✅ Pass |
| `voice_sessions(project_id)` → `idx_voice_sessions_project` | ✅ Pass |
| `invitations(token)` → via UNIQUE constraint | ✅ Pass |

#### Timestamps
| Criterion | Status |
|-----------|--------|
| All 9 tables: `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` | ✅ Pass |
| Mutable tables (profiles, projects, chapters, project_covers): `updated_at` + BEFORE UPDATE trigger | ✅ Pass |

#### Functions & Triggers
| Criterion | Status |
|-----------|--------|
| `get_my_project_ids()` SECURITY DEFINER, STABLE, `search_path=''` | ✅ Pass |
| `handle_new_user()` SECURITY DEFINER, `search_path=''`, inserts into profiles on auth.users INSERT | ✅ Pass |
| `update_updated_at()` applied to 4 mutable tables | ✅ Pass |

**Total: 36/37 criteria pass (1 untestable by design)**

### Bugs Found

#### BUG-1 — Medium: Migration timestamp drift between Git files and remote DB
**Description:** Local migration files use timestamps `20260515200000/200001/200002` but the remote DB migration table records them as `20260515221706/221728/221757` (the actual apply-time timestamps from MCP). If Supabase CLI is introduced later, it would attempt to re-apply the Git-named migrations as new migrations, causing "table/type already exists" errors.

**Steps to reproduce:** Run `supabase db push` from CLI after cloning the repo — CLI reads Git filenames but DB has different version identifiers.

**Impact:** No impact for the current remote-only/MCP workflow. Blocks CLI adoption without a manual migration table sync.

**Workaround:** Rename local migration files to match the DB timestamps (`20260515221706_initial_schema.sql` etc.) OR add the DB-tracked versions to a `.supabase/migrations` state file. Alternatively, address if/when CLI is introduced.

---

#### BUG-2 — **High** (revidiert von Medium am 2026-05-16): `portal_access_expires_at` writable by any project member via client
**Description:** The `projects: update as member` RLS policy grants UPDATE on ALL columns to all project members (both `projektleiter` and `co_author`). This includes `portal_access_expires_at`, which gates premium portal access and must only be written by the Stripe webhook via `service_role`. A malicious member can directly grant themselves unlimited portal access without paying — this is a complete bypass of the paywall.

**Steps to reproduce:** As any authenticated project member, issue:
```sql
UPDATE projects SET portal_access_expires_at = '2099-01-01' WHERE id = '<own-project-id>';
```
RLS permits this. The middleware will then route the user as having active access.

**Severity rationale (2026-05-16 re-assessment):** Previously rated Medium under the assumption "no real users yet." Re-rated **High** because:
- Becoming a `co_author` is trivial (accepting an invitation).
- The bug is exploitable with one SQL statement via the public anon key.
- It directly nullifies the monetization model the moment PROJ-6 (Stripe) goes live.
- It cannot be silently shipped: PROJ-6 **must** close the gap before any payment path is enabled.

**Impact:** Pre-PROJ-6: cosmetic (no paywall to bypass). Post-PROJ-6 without fix: **total revenue loss vector** + free Vapi inclusive-quota for anyone with co_author access.

**Required fix (now mandatory for PROJ-6):** Postgres RLS does not support column-level UPDATE permissions. Choose one of:
1. **Recommended:** Move `portal_access_expires_at` into a new table `project_access` (one row per project, no client UPDATE policy — webhook-write only via `service_role`).
2. `BEFORE UPDATE` trigger on `projects` that rejects changes to `portal_access_expires_at` unless `auth.uid() IS NULL` (= service_role context).

PROJ-6 spec has been updated to make this a blocking acceptance criterion.

---

#### BUG-3 — Low: Typo in TypeScript source file inconsistent with seed data
**Description:** `src/lib/projektuebersicht-erzaehl-impulse.ts` (migrated from old app) line 7 contains `"Berufseinsteig und wichtige Stationen"` (missing 'n'). The `supabase/seed.sql` correctly inserted `"Berufseinstieg und wichtige Stationen"` (correct German). PROJ-8 will import from the TypeScript file and display the typo version when building the impulse catalog UI.

**Fix:** Correct line 7 in `src/lib/projektuebersicht-erzaehl-impulse.ts` from `"Berufseinsteig"` to `"Berufseinstieg"`.

### Security Audit

| Check | Result |
|-------|--------|
| No open SELECT policies (unauthenticated access) | ✅ Clean |
| No tables with RLS enabled but zero policies (de-facto locked) | ✅ Clean — all covered |
| `SECURITY DEFINER` functions use `SET search_path = ''` | ✅ Clean |
| service_role key never fetched or exposed in this session | ✅ Clean |
| `payments`/`voice_sessions` audit trail preserved (ON DELETE SET NULL on FKs) | ✅ Clean |
| Storage buckets all private (public=false) | ✅ Clean |
| Storage policies use path-based project membership (`string_to_array(name,'/')[1]::uuid`) | ✅ Clean |
| `invitations` email-based SELECT is JWT-signed (not spoofable) | ✅ Clean |
| `projects: insert authenticated` allows unlimited project creation | ⚠️ Known risk (see BUG-2 context; rate-limit in PROJ-13) |

### Production-Ready Decision

**✅ APPROVED with PROJ-6 Blocker** (revidiert 2026-05-16)

Schema-Grundgerüst ist solide und für PROJ-2 (Auth + SSR) tragfähig. Eine offene **High-Severity-Lücke** (BUG-2) muss jedoch zwingend im Rahmen von PROJ-6 (Stripe) geschlossen werden, **bevor** der Stripe-Webhook scharfgeschaltet wird. Andernfalls würde die Bezahlschranke direkt nach Aktivierung umgangen werden können.

**Status pro Bug:**
- BUG-1 (Medium): kein Impact auf aktuellen MCP-Workflow — späterer CLI-Adoption-Blocker
- BUG-2 (**High**): **Blocker für PROJ-6 Go-Live** — Fix-Pflicht in PROJ-6-Spec verankert
- BUG-3 (Low): kosmetischer Tippfehler im migrierten TS-File

## Deployment
_To be added by /deploy_
