# Product Requirements Document

## Vision
NARRAVIT verwandelt persönliche Lebensgeschichten in ein hochwertig gedrucktes
Hardcover-Buch. Das Schreibportal gibt Menschen — oft wenig technikaffin,
immer emotional bewegt — einen barrierearmen Weg, ihre Erinnerungen zu erzählen:
selbst schreiben in einem Word-ähnlichen A5-Editor oder am Telefon mit einem
KI-Assistenten erzählen. Das Endprodukt ist ein Premium-Hardcover als
dauerhaftes Familien-Erbe.

## Target Users

**Primär — Initiatoren (meist jüngere Generation)**
Kaufen das Lebensbuch als Geschenk für Eltern/Großeltern. Technisch versierter
als der Schreibende. Wollen Familiengeschichte festhalten, scheitern bisher an
Aufwand und Koordination.

**Sekundär — Schreibende (ältere Generation)**
Möchten ihre Lebensgeschichte bewahren; wenig Schreiberfahrung. Leeres Blatt
und Technik-Angst als größte Hürden. Brauchen emotionalen Einstieg, Struktur
(Impulse) und ein einfaches Werkzeug.

## Core Features (Roadmap)

| Priority  | Feature                              | Status  |
|-----------|--------------------------------------|---------|
| P0 (MVP)  | Supabase-Datenmodell & RLS           | Planned ✓ |
| P0 (MVP)  | Auth + SSR                           | Planned |
| P0 (MVP)  | Persönlicher Bereich + Konto         | Planned |
| P0 (MVP)  | Kapitel-Routing & Persistenz         | Planned |
| P0 (MVP)  | Kapitel-Editor (A5, TipTap, Tablet)  | Planned |
| P0 (MVP)  | Stripe-Zahlungen (Portal + Vapi)     | Planned |
| P1        | Buchweite Seitenzahl — Live-Anzeige  | Planned |
| P1        | Erzähl-Impulse (Katalog + API)       | Planned |
| P1        | Projekt-Mitglieder + Einladungen     | Planned |
| P1        | Cover-Editor                         | Planned |
| P1        | Resend-Transaktionsmails             | Planned |
| P1        | Vapi-Pipeline                        | Planned |
| P1        | Querschnitt: Stabilität & Observ.    | Planned |
| P2        | KI-Review + LLM-Abstraktion          | Planned |
| P2        | Mehrnutzer-Concurrency & Versioning  | Planned |
| P2        | Print-on-Demand Adapter              | Planned |

## Success Metrics
- Erste erfolgreich bezahlte Portal-Buchungen (Conversion)
- Projekte mit ≥ 3 fertiggestellten Kapiteln (Engagement)
- Abgeschlossene Vapi-Erzähl-Sessions (Voice-Kanal-Nutzung)
- Erste gedruckte Bücher (PoD-Abschlussrate)
- Verlängerungskäufe nach Ablauf (Retention)

## Constraints
- Solo-Entwicklung; Build-Reihenfolge strikt nach Abhängigkeiten
- Stack fix: Next.js 16, Supabase, TipTap, Tailwind v3 + shadcn/ui, Stripe, Vapi, Resend, Vercel
- Frontend: 1:1-Migration aus alter App (kein Redesign); Design-System aus `projektuebersicht-palette.ts` + shadcn/ui
- A5-Hochformat fest; Phone erhält keinen Kapitel-Editor
- Einmalkauf-Modell (kein Abo); LLMs nur serverseitig
- Vapi-Inklusiv-10h: Gutschrift beim ersten bezahlten Portal-Zugang (via Stripe-Webhook)
- Buchweite Seitenzahl: Live-Anzeige im Editor (persistierte Seiten-Offsets + Berechnungs-Job)
- PoD-Anbieter noch nicht gewählt (Phase 10 blockiert bis Entscheidung)

## Non-Goals
- Echtzeit-Kollaboration (kein Yjs / Live-Editing)
- Abo-Modell für Portal-Zugang
- Mobiler Kapitel-Editor (Phone erhält Hinweis + Link zu Desktop/Tablet)
- Andere Buchformate als A5-Hochformat
- B2B-Flows oder Team-Accounts
- Vapi + PoD vor stabilem Editor + Stripe (Sequenz laut Roadmap)
