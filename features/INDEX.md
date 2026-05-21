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
| PROJ-1 | Supabase-Datenmodell & RLS | P0 | Approved | — | [Spec](PROJ-1-supabase-datenmodell-rls.md) | 2026-05-15 |
| PROJ-2 | Auth + SSR | P0 | Approved | PROJ-1 | [Spec](PROJ-2-auth-ssr.md) | 2026-05-15 |
| PROJ-3 | Persönlicher Bereich + Konto | P0 | Deployed | PROJ-2 | [Spec](PROJ-3-persoenlicher-bereich-konto.md) | 2026-05-15 |
| PROJ-4 | Kapitel-Routing & Persistenz | P0 | Deployed | PROJ-2 | [Spec](PROJ-4-kapitel-routing-persistenz.md) | 2026-05-15 |
| PROJ-5 | Kapitel-Editor (A5, TipTap, Tablet) | P0 | Approved | PROJ-4 | [Spec](PROJ-5-kapitel-editor.md) | 2026-05-15 |
| PROJ-6 | Stripe-Zahlungen (Portal + Vapi-Paket) | P0 | Approved | PROJ-2, PROJ-4 | [Spec](PROJ-6-stripe-zahlungen.md) | 2026-05-15 |
| PROJ-7 | Buchweite Seitenzahl – Live-Anzeige | P1 | Planned | PROJ-1, PROJ-5 | [Spec](PROJ-7-buchweite-seitenzahl-live-anzeige.md) | 2026-05-15 |
| PROJ-8 | Erzähl-Impulse (Katalog + API) | P1 | Roadmap | PROJ-4 | — | 2026-05-15 |
| PROJ-9 | Projekt-Mitglieder + Einladungen | P1 | Roadmap | PROJ-2, PROJ-4 | — | 2026-05-15 |
| PROJ-10 | Cover-Editor | P1 | Roadmap | PROJ-4 | — | 2026-05-15 |
| PROJ-11 | Resend-Transaktionsmails | P1 | Roadmap | PROJ-6 | — | 2026-05-15 |
| PROJ-12 | Vapi-Pipeline | P1 | Roadmap | PROJ-5, PROJ-6 | — | 2026-05-15 |
| PROJ-13 | Querschnitt: Stabilität & Observability | P1 | Roadmap | PROJ-2, PROJ-5 | — | 2026-05-15 |
| PROJ-14 | KI-Review + LLM-Abstraktion | P2 | Roadmap | PROJ-5, PROJ-6 | — | 2026-05-15 |
| PROJ-15 | Mehrnutzer-Concurrency & Versioning | P2 | Roadmap | PROJ-5 | — | 2026-05-15 |
| PROJ-16 | Print-on-Demand Adapter | P2 | Roadmap | PROJ-5, PROJ-6, PROJ-10, PROJ-11 | — | 2026-05-15 |
| PROJ-17 | Rate-Limiting für Auth-Endpunkte | P0 | Planned | PROJ-2 | [Spec](PROJ-17-rate-limiting-auth.md) | 2026-05-16 |
| PROJ-18 | Debug-Telemetrie-Cleanup | P0 | Approved | — | [Spec](PROJ-18-debug-telemetrie-cleanup.md) | 2026-05-16 |
| PROJ-19 | Production-Hardening (Headers, Middleware-Caching, Env-Failsafe) | P1 | Planned | PROJ-2 | [Spec](PROJ-19-production-hardening.md) | 2026-05-16 |

<!-- Add features above this line -->

## Next Available ID: PROJ-20

## Empfohlene Build-Reihenfolge
```
PROJ-1 → PROJ-2 → PROJ-3, PROJ-4, PROJ-6 (parallel)
       → PROJ-5 → PROJ-7, PROJ-8, PROJ-9, PROJ-10, PROJ-13 (parallel)
                → PROJ-11, PROJ-12
                         → PROJ-14, PROJ-15, PROJ-16

Security-Querschnitt (parallel, vor Public-Launch zwingend):
PROJ-18 (jederzeit, kein Dep) → PROJ-17 (nach PROJ-2 ✓) → PROJ-19 (nach PROJ-2 ✓)
```
