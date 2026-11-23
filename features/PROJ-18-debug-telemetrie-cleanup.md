# PROJ-18: Debug-Telemetrie-Cleanup

> **Kurzfassung (PROJ-31).** Das vollständige Tech Design, Bau-Notizen, QA-Protokolle und der Deployment-Verlauf stehen unverändert im [Archiv](archive/PROJ-18-debug-telemetrie-cleanup.md).

## Status: Approved
**Created:** 2026-05-16
**Last Updated:** 2026-05-16
**Priority:** P0 (Production-Build-Blocker)
**Trigger:** Vibe-Security-Audit 2026-05-16 — High-Medium-Finding #2

## Dependencies
- Keine — reine Bereinigung von vorhandenem Code
- Empfohlen vor: jedem produktiven Build (auch Stage)

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

## Offene Punkte
Keine.
