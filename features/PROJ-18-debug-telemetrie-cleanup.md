# PROJ-18: Debug-Telemetrie-Cleanup

## Status: Planned
**Created:** 2026-05-16
**Last Updated:** 2026-05-16
**Priority:** P0 (Production-Build-Blocker)
**Trigger:** Vibe-Security-Audit 2026-05-16 — High-Medium-Finding #2

## Dependencies
- Keine — reine Bereinigung von vorhandenem Code
- Empfohlen vor: jedem produktiven Build (auch Stage)

## Problem
Sieben hart kodierte Debug-Logger-`fetch`-Calls sind über das Repo verteilt. Sie zeigen alle auf einen lokalen Loopback-Endpoint mit fester UUID:

```ts
fetch("http://127.0.0.1:7800/ingest/fd631e72-4665-4122-b32e-2df0088c7344", { ... }).catch(() => {});
```

Stellen:

| Datei | Zeile | Kontext |
|-------|-------|---------|
| [next.config.ts](../next.config.ts) | 5 | Läuft zur **Build-Zeit** auf Vercel-Build-Maschinen |
| [src/app/layout.tsx](../src/app/layout.tsx) | 7 | Läuft auf dem Server bei jedem Request |
| [src/app/onboarding/page.tsx](../src/app/onboarding/page.tsx) | 7, 16, 26 | Server Component — jeder Onboarding-Aufruf |
| [src/app/onboarding/OnboardingWizard.tsx](../src/app/onboarding/OnboardingWizard.tsx) | 69, 74 | `"use client"` — landet im Browser-Bundle, läuft bei **jedem User** |

### Konkrete Auswirkungen

**Client-Bundle (OnboardingWizard.tsx):**
- Jeder Endnutzer schickt bei jedem Render `POST http://127.0.0.1:7800/...` mit internem State (`stepIndex`, `currentStep`, `userPresent`-Flag, Projektanzahl)
- Browser-DevTools-Konsole zeigt Endnutzern dauerhaft Network-Fehler → unprofessioneller Eindruck
- Hartkodierte UUID `fd631e72-4665-4122-b32e-2df0088c7344` ist im JS-Bundle indizierbar (Source-Map-Leak, GitHub-Code-Search)
- Theoretisches Risiko: nutzt der User zufällig lokal einen Service auf Port 7800 (eigene Dev-Tools, Tests), bekommt dieser Service unbeabsichtigt Daten

**Server-Side (next.config.ts, layout.tsx, page.tsx):**
- Production-Server (Vercel) führt Loopback-Fetches bei jedem Render aus → Fehlversuch + Latenz
- `next.config.ts:5` läuft zur Build-Zeit → kann Build verzögern oder bei Sandboxed-Build-Environments mit blockiertem Loopback zu Timeouts führen
- Strukturierte Logs (Vercel Functions Logs / Sentry) füllen sich mit Fetch-Errors

**Strategisch:** Echtes Logging gehört in eine ordentliche Telemetrie-Lösung (Sentry → PROJ-13). Diese Debug-Sonden sind weder das eine noch das andere und sollten ersatzlos verschwinden.

## User Stories
- Als Endnutzer möchte ich keine fremden Network-Requests aus meinem Browser an Localhost-Ports sehen, damit das Produkt vertrauenswürdig wirkt und meine Daten transparent fließen.
- Als Plattform-Betreiber möchte ich Production-Logs frei von Test-/Debug-Rauschen haben, damit echte Fehler nicht untergehen.
- Als Entwickler möchte ich, dass Telemetrie in einem zentralen Modul kapsuliert ist (PROJ-13), damit künftige Debug-Wünsche nicht wieder als Copy-Paste-Sonden durch den Code wandern.

## Acceptance Criteria

### Cleanup
- [ ] Alle 7 `// #region agent log` … `// #endregion` Blöcke werden **ersatzlos entfernt** aus:
  - [ ] [next.config.ts](../next.config.ts)
  - [ ] [src/app/layout.tsx](../src/app/layout.tsx)
  - [ ] [src/app/onboarding/page.tsx](../src/app/onboarding/page.tsx) (3 Blöcke)
  - [ ] [src/app/onboarding/OnboardingWizard.tsx](../src/app/onboarding/OnboardingWizard.tsx) (2 Blöcke)
- [ ] Falls vorhanden: zugehörige `useEffect`-Wrapper, die ausschließlich dem Logger dienten, ebenfalls entfernen
- [ ] Imports, die nach Cleanup ungenutzt werden, werden mit-entfernt (`npm run lint` muss grün sein)

### Verifikation
- [ ] **Repo-weiter Grep** liefert null Treffer:
  - [ ] `grep -rn "127.0.0.1:7800" .` → 0 Treffer
  - [ ] `grep -rn "ingest/fd631e72" .` → 0 Treffer
  - [ ] `grep -rn "#region agent log" .` → 0 Treffer
- [ ] `npm run build` läuft ohne Fehler durch
- [ ] `npm run lint` läuft ohne neue Warnungen durch
- [ ] Bestehende E2E-Tests (`npm run test:e2e`) laufen unverändert grün (insbesondere die 22 PROJ-2-Tests)
- [ ] **Manual Smoke-Test:** Onboarding-Wizard im Browser öffnen → DevTools → Network-Tab darf **keine** Requests an `127.0.0.1:7800` zeigen

### Prävention (damit es nicht wieder passiert)
- [ ] ESLint-Custom-Rule oder einfache Lint-Konvention: PR-Reviewer-Checkliste in `.github/PULL_REQUEST_TEMPLATE.md` (oder vorhandenem Equivalent) ergänzen mit Punkt: *"Keine hartcodierten Localhost-URLs oder Loopback-Telemetrie-Endpunkte"*
- [ ] CI-Schritt (optional, kann später als Teil von PROJ-13 kommen): Build-Pipeline ruft `! grep -r "127.0.0.1:7800" src/ next.config.ts` und fail-t den Build bei Treffer
- [ ] Memory-Eintrag (`feedback_no_debug_loopback_in_source.md`) anlegen, der Agents davon abhält, beim Debugging Loopback-Sonden zu hinterlassen

## Edge Cases
- **Tests, die explizit das Vorhandensein eines Telemetrie-Endpunkts prüfen** — existieren nicht im Repo (verifiziert). Falls künftig welche entstehen: ebenfalls entfernen.
- **Source-Maps in Production** — Auch wenn Sentry oder vergleichbare Tools Source-Maps zur Stack-Trace-Auflösung brauchen: nach diesem Cleanup ist die UUID nicht mehr im Source enthalten, also nicht extrahierbar.
- **Vorhandene Git-History** — Die UUID bleibt in alten Commits sichtbar (`git log -p`). Da es kein echtes Secret war (nur ein interner Debug-Identifier), kein History-Rewrite nötig. Falls der Debug-Server real existiert und schützenswert ist: Endpoint serverseitig rotieren.

## Technical Requirements
- **Kein Replacement durch echtes Logging** im Rahmen dieses Tickets — echtes Logging (Sentry, strukturiertes Logging) ist Scope von PROJ-13
- **Keine Feature-Flag-Verschiebung** ("nur in Dev aktiv") — die Calls bringen keinen Wert und sollen komplett weg
- **Atomarer PR:** Cleanup in einem einzigen Commit / PR, damit Reviewer den Diff überblicken können (~30 Zeilen Löschung)

## Severity Rationale
**P0** weil:
- Funktional kein Feature, aber **Produktionsqualität-Blocker** — kein vernünftiges Public-Launch mit diesen Sonden im Bundle
- Aufwand minimal (geschätzt < 30 Minuten)
- Verzögert echte Production-Vorbereitung jeden Tag, an dem es offen ist

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_Nicht erforderlich — reines Cleanup-Ticket; direkt nach `/frontend` oder im Rahmen von `/refine`-Sweeps ausführbar_

## QA Test Results
_To be added by /qa — Grep-Checks + Build + bestehende E2E-Suite_

## Deployment
_To be added by /deploy_
