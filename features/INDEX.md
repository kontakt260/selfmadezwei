# Feature Index

> Central tracking for all features. Updated by skills automatically.

## Status Legend
- **Roadmap** - `/init` done, feature identified in feature map, no spec file yet
- **Planned** - `/write-spec` done, full spec written, architecture not yet designed
- **Architected** - `/architecture` done, tech design approved, ready to build
- **In Progress** - `/frontend` or `/backend` active or completed, not yet in QA
- **In Review** - `/qa` active, testing in progress
- **Approved** - `/qa` passed, no critical/high bugs, ready to deploy
- **Deployed** - `/deploy` done, live in production

## Features

| ID | Feature | Prio | Status | Abhängigkeiten | Spec | Erstellt |
|----|---------|------|--------|----------------|------|---------|
| PROJ-1 | Supabase-Datenmodell & RLS | P0 | Deployed | — | [Spec](PROJ-1-supabase-datenmodell-rls.md) | 2026-05-15 |
| PROJ-2 | Auth + SSR | P0 | Deployed | PROJ-1 | [Spec](PROJ-2-auth-ssr.md) | 2026-05-15 |
| PROJ-3 | Persönlicher Bereich + Konto | P0 | Approved | PROJ-2 | [Spec](PROJ-3-persoenlicher-bereich-konto.md) | 2026-05-15 |
| PROJ-4 | Kapitel-Routing & Persistenz | P0 | Deployed | PROJ-2 | [Spec](PROJ-4-kapitel-routing-persistenz.md) | 2026-05-15 |
| PROJ-5 | Kapitel-Editor (A5, TipTap, Tablet) | P0 | Deployed | PROJ-4 | [Spec](PROJ-5-kapitel-editor.md) | 2026-05-15 |
| PROJ-6 | Stripe-Zahlungen (Portal) | P0 | Approved | PROJ-2, PROJ-4 | [Spec](PROJ-6-stripe-zahlungen.md) | 2026-05-15 |
| PROJ-7 | Buchweite Seitenzahl – Live-Anzeige | P1 | Deployed | PROJ-1, PROJ-5 | [Spec](PROJ-7-buchweite-seitenzahl-live-anzeige.md) | 2026-05-15 |
| PROJ-8 | Erzähl-Impulse (Katalog + API) | P1 | Deployed | PROJ-1, PROJ-4, PROJ-5 | [Spec](PROJ-8-erzaehl-impulse-katalog-api.md) | 2026-05-15 |
| PROJ-9 | Projekt-Mitglieder + Einladungen | P1 | Deployed | PROJ-1, PROJ-2, PROJ-4 | [Spec](PROJ-9-projekt-mitglieder-einladungen.md) | 2026-05-15 |
| PROJ-10 | Cover-Editor | P1 | Deployed | PROJ-1, PROJ-2, PROJ-3, PROJ-4 | [Spec](PROJ-10-cover-editor.md) | 2026-05-15 |
| PROJ-11 | Resend-Transaktionsmails | P1 | Approved | PROJ-2, PROJ-6, PROJ-9 | [Spec](PROJ-11-resend-transaktionsmails.md) | 2026-05-15 |
| PROJ-12 | Audio-Erzählpipeline (Sprachnachrichten, ersetzt Vapi) | P1 | Architected | PROJ-1, PROJ-3, PROJ-4, PROJ-5, PROJ-6, PROJ-8, PROJ-9, PROJ-11 | [Spec](PROJ-12-audio-erzaehlpipeline.md) | 2026-05-15 |
| PROJ-13 | Querschnitt: Stabilität & Observability | P1 | Roadmap | PROJ-2, PROJ-5 | — | 2026-05-15 |
| PROJ-14 | KI-Review + LLM-Abstraktion | P2 | Roadmap | PROJ-5, PROJ-6 | — | 2026-05-15 |
| PROJ-15 | Mehrnutzer-Concurrency & Versioning | P2 | Roadmap | PROJ-5 | — | 2026-05-15 |
| PROJ-16 | Print-on-Demand Adapter | P2 | Roadmap | PROJ-5, PROJ-6, PROJ-10, PROJ-11 | — | 2026-05-15 |
| PROJ-17 | Rate-Limiting für Auth-Endpunkte | P0 | Approved | PROJ-2 | [Spec](PROJ-17-rate-limiting-auth.md) | 2026-05-16 |
| PROJ-18 | Debug-Telemetrie-Cleanup | P0 | Approved | — | [Spec](PROJ-18-debug-telemetrie-cleanup.md) | 2026-05-16 |
| PROJ-19 | Production-Hardening (Headers, Middleware-Caching, Env-Failsafe) | P1 | Approved | PROJ-2 | [Spec](PROJ-19-production-hardening.md) | 2026-05-16 |
| PROJ-22 | Design-Grundlage der Web-App | P1 | Approved | PROJ-3, PROJ-4, PROJ-9, PROJ-10, PROJ-28 | [Spec](PROJ-22-design-grundlage.md) | 2026-11-23 |
| PROJ-24 | Onboarding optimieren | P1 | Approved | PROJ-6, PROJ-9, PROJ-12, PROJ-22 | [Spec](PROJ-24-onboarding-optimieren.md) | 2026-11-23 |
| PROJ-25 | Kapitel-Editor stabilisieren | P1 | Approved | PROJ-5, PROJ-7, PROJ-28, PROJ-31 | [Spec](PROJ-25-kapitel-editor-stabil.md) | 2026-11-23 |
| PROJ-26 | Papierkorb (serverseitig, 14 Tage) | P0 | Approved | PROJ-1, PROJ-3, PROJ-4, PROJ-5, PROJ-6, PROJ-7, PROJ-9, PROJ-10, PROJ-11 | [Spec](PROJ-26-papierkorb.md) | 2026-11-22 |
| PROJ-28 | Aufbewahrung, Lesemodus und automatische Löschung | P0 | Approved | PROJ-3, PROJ-5, PROJ-6, PROJ-9, PROJ-10, PROJ-11, PROJ-26 | [Spec](PROJ-28-aufbewahrung-automatische-loeschung.md) | 2026-11-22 |
| PROJ-29 | Webflow-Landingpage gemeinsam prüfen und überarbeiten (über MCP) | P1 | Roadmap | — | — | 2026-11-23 |
| PROJ-30 | Ladezeiten verbessern (Ladeansicht, weniger Datenbankaufrufe) | P1 | In Review | PROJ-3, PROJ-4, PROJ-5, PROJ-10, PROJ-22, PROJ-28 | [Spec](PROJ-30-ladezeiten.md) | 2026-11-23 |
| PROJ-31 | Code aufräumen und Tests verschlanken | P2 | Approved | PROJ-24, PROJ-30 | [Spec](PROJ-31-code-aufraeumen.md) | 2026-11-23 |
| PROJ-32 | Schriftarten im Kapitel-Editor | P1 | Roadmap | PROJ-25 | — | 2026-11-23 |
| PROJ-33 | Impuls-Bibliothek | P1 | Roadmap | PROJ-8, PROJ-22, PROJ-28 | — | 2026-11-23 |
| PROJ-34 | Bilder im Kapiteltext und Hochkant | P1 | Approved | PROJ-3, PROJ-5, PROJ-7, PROJ-25, PROJ-26, PROJ-28 | [Spec](PROJ-34-bilder-im-kapitel.md) | 2026-11-23 |
| PROJ-35 | Automatische Silbentrennung | P1 | Planned | PROJ-5, PROJ-7, PROJ-25, PROJ-28, PROJ-34 | [Spec](PROJ-35-silbentrennung.md) | 2026-11-24 |
| PROJ-36 | Hilfe und Anleitung in der Seitenleiste | P1 | Roadmap | PROJ-22, PROJ-34 | — | 2026-11-24 |

<!-- Add features above this line -->

## Next Available ID: PROJ-37

> PROJ-20, PROJ-21, PROJ-23 und PROJ-27 sind für geplante Themen reserviert und haben noch keine Spec.

## Empfohlene Build-Reihenfolge
```
PROJ-1 → PROJ-2 → PROJ-3, PROJ-4, PROJ-6 (parallel)
       → PROJ-5 → PROJ-7, PROJ-8, PROJ-9, PROJ-10, PROJ-13 (parallel)
                → PROJ-11, PROJ-12
                         → PROJ-14, PROJ-15, PROJ-16

Security-Querschnitt (parallel, vor Public-Launch zwingend):
PROJ-18 (jederzeit, kein Dep) → PROJ-17 (nach PROJ-2 ✓) → PROJ-19 (nach PROJ-2 ✓)
```
