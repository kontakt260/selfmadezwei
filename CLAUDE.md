# NARRAVIT — Schreibportal (selfmadezwei)

> Dies ist der **Neuaufbau** des NARRAVIT-Schreibportals auf Basis des "AI Coding Starter Kit"-Templates. Eine **frühere Version** existiert unter `/Users/jakobtrierweiler/Desktop/GitHub/selfmade/my-app` — deren **Frontend wird 1:1 übernommen** und nur an den neuen Stack angepasst.

## Produkt (Kurzfassung)

NARRAVIT verwandelt persönliche Lebensgeschichten in ein **hochwertig gedrucktes Hardcover-Buch** ("Lebensbuch"). Zwei Erzählwege:
- **Telefon-Assistent (Vapi):** Geschichten am Telefon erzählen → Audio → Text.
- **Schreibportal (dieses Repo):** Selbst schreiben in einem Word-ähnlichen A5-Editor.

Unterstützt durch Leitfragen, Erzähl-Impulse, Lektorat und Print-on-Demand. Käufer sind oft jüngere Generationen, die Familiengeschichte als Geschenk festhalten wollen.

## Pflichtlektüre (immer zuerst lesen)

1. **[docs/PRD.md](docs/PRD.md)** — Produkt-Briefing, Vision, Zielgruppen, Constraints, Nicht-Ziele. **Source of Truth** für Prioritäten.
2. **[features/INDEX.md](features/INDEX.md)** — Feature-Status pro PROJ-X.

## Frontend-Übernahme (verbindlich)

Das **gesamte bestehende Frontend** der alten App soll **1:1 übernommen** werden — Look, Layout, Komponentenstruktur, deutsche Bezeichner. Angepasst werden nur:
- **Styling-Layer:** Roh-Tailwind v4 → **Tailwind v3 + shadcn/ui** (vorinstallierte UI-Primitives unter `src/components/ui/` wiederverwenden, niemals neu bauen).
- **Datenzugriff:** Mock-Daten (`lib/mock-*.ts`) → **Supabase** Server Actions/Routes mit RLS.
- **Routing/Validierung:** Projekt/Kapitel-IDs künftig **in der URL + serverseitig geprüft**, nicht nur sessionStorage.

### Quell-Inventar (alt → neu)

Quelle: `/Users/jakobtrierweiler/Desktop/GitHub/selfmade/my-app/`

**Pages (`app/` → `src/app/`):**
- `anmelden/page.tsx`
- `registrieren/page.tsx`
- `onboarding/page.tsx`
- `persoenlicher-bereich/page.tsx`
- `kaufuebersicht/page.tsx`
- `projektuebersicht/page.tsx`
- `projektuebersicht/kapiteleditor/page.tsx`
- `projektuebersicht/cover-bearbeiten/page.tsx`
- `layout.tsx`, `page.tsx`, `globals.css`, `icon.svg`

**Komponenten (`components/` → `src/components/`):**
- `AppShell.tsx`, `Navbar.tsx`, `ProjectCard.tsx`
- `projektuebersicht/ChapterDragList.tsx`
- `projektuebersicht/ChapterListSection.tsx`
- `projektuebersicht/OrderPrintDialogTrigger.tsx`
- `projektuebersicht/ProjectUsersSection.tsx`

**Lib (`lib/` → `src/lib/`):**
- `mock-projects.ts` (→ später durch Supabase-Layer ersetzen, aber Typen/Shape erhalten)
- `projektuebersicht-chapters.ts`
- `projektuebersicht-erzaehl-impulse.ts`
- `projektuebersicht-palette.ts`

**Assets:** `public/` (Logo, Icons) und `app/icon.svg` ebenfalls übernehmen.

### Migrations-Reihenfolge (Empfehlung)

1. Globale Styles, Farbpalette, Typografie (`globals.css`, `projektuebersicht-palette.ts`) — visuelle Identität sichern.
2. AppShell + Navbar — Layout-Skelett.
3. Statische Pages: anmelden, registrieren, onboarding, kaufuebersicht.
4. Projektübersicht inkl. ChapterDragList / Impulse (zuerst mit migrierten Mocks, dann Supabase).
5. Kapitel-Editor (A5, TipTap — Tablet-tauglich, kein Phone-Editor).
6. Cover-Editor.
7. Persönlicher Bereich + Konto an echte Auth/RLS koppeln.

## Feste Produktentscheidungen (nicht neu verhandeln)

- **A5-Hochformat** im Editor; **Phone:** kein produktiver Kapitel-Editor (Hinweis + Link); **Tablet & Desktop:** voll.
- **Einmalkauf + Verlängerung**, **kein Abo**. Initial-Portalzugang typ. 1 Jahr.
- **10 h Vapi-Erzählzeit inkl.** pro Projekt; Nachkauf **+60 Min / 19 €** bei <60 Min Rest.
- **Kein Live-Co-Editing.** Mehrnutzer per Last-Writer-Wins + geplantes `content_version`-Locking.
- **LLMs nur serverseitig** (Keys nie im Client), Provider-Abstraktion.
- **Chapter title** ist die einzige Überschriftenquelle (Sync mit Übersicht).
- **Projekt-/Kapitel-IDs** in URL + Server+RLS, nie nur sessionStorage.

## Tech Stack (neu)

- **Framework:** Next.js 16 (App Router), TypeScript, React 19
- **Styling:** Tailwind CSS v3 + **shadcn/ui** (copy-paste components, niemals neu bauen)
- **Backend:** Supabase (PostgreSQL + Auth + Storage + RLS)
- **Editor:** TipTap (aus alter App weiterverwenden)
- **Validierung:** Zod + react-hook-form
- **State:** React useState / Context API
- **Tests:** Vitest (Unit), Playwright (E2E)
- **Deployment:** Vercel

## Projektstruktur

```
src/
  app/              Pages (Next.js App Router)
  components/
    ui/             shadcn/ui — NIEMALS neu bauen
  hooks/            Custom React hooks
  lib/              utils.ts, supabase.ts, migriertes Domain-Layer
features/           Feature-Specs (PROJ-X-name.md)
  INDEX.md          Status-Übersicht
docs/
  PRD.md            Produkt-Briefing, Vision, Constraints, Nicht-Ziele
  production/       Sentry / Security / Performance / Rate Limits
```

## Development Workflow

1. `/init` — PRD und Feature-Map initial anlegen (einmalig)
2. `/write-spec` — Feature-Spec pro PROJ-X
3. `/architecture` — Tech-Design (PM-tauglich, kein Code)
4. `/frontend` — UI bauen (shadcn/ui zuerst!) — **Quelle: alte App-Komponenten**
5. `/backend` — APIs, Schemas, RLS-Policies in Supabase
6. `/qa` — Acceptance-Tests + Security-Audit
7. `/deploy` — Vercel + Production-Checks

`/refine PROJ-X` jederzeit zum Verfeinern einer Spec.

## Konventionen

- **Feature-IDs:** PROJ-1, PROJ-2, … (sequentiell)
- **Commits:** `feat(PROJ-X): description`, `fix(PROJ-X): description`
- **Single Responsibility:** ein Feature pro Spec
- **shadcn/ui first:** keine eigenen Versionen installierter shadcn-Komponenten
- **Read-before-edit:** Dateien immer erst lesen, nie aus dem Gedächtnis raten
- **Tests neben Source:** `useHook.test.ts` neben `useHook.ts`; E2E in `tests/`
- **Server-side first:** `project_id` / `chapter_id` und Auth immer serverseitig validieren; keine Secrets im Client; Stripe/Vapi-Webhooks signieren
- **Keine visuellen Overlay-Hacks:** Wenn ein Element falsch rendert (z. B. Border läuft durch Seitenzwischenraum), das Element ECHT im Code anpassen — niemals ein farbiges Pseudo-Element / weißes Div darüber legen, das den Bug optisch verdeckt. Overlays brechen bei Skalierung, Theme-Wechsel, Print-Export und sind Pixel-genau abhängig von Font-Metriken. Stattdessen: DOM strukturell ändern, CSS-`mask-image`/`clip-path` direkt auf dem fehlerhaften Element, oder Rendering-Logik in der Engine korrigieren.

## Build- & Test-Commands

```bash
npm run dev          # Dev-Server (localhost:3000)
npm run build        # Production-Build
npm run lint         # ESLint
npm run start        # Production-Server
npm test             # Vitest
npm run test:e2e     # Playwright
npm run test:all     # beide Suites
```

## Nicht-Ziele (nicht neu erfinden)

Vor größeren Änderungen [docs/PRD.md](docs/PRD.md) und [features/INDEX.md](features/INDEX.md) lesen. **Diese Nicht-Ziele sind gesetzt:** kein Live-Co-Editing, kein Abo, kein Phone-Editor, kein anderes Buchformat als A5.

## Produkt-Kontext

@docs/PRD.md

## Feature-Übersicht

@features/INDEX.md
