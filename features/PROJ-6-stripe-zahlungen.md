# PROJ-6: Stripe-Zahlungen (Portal)

> **Kurzfassung (PROJ-31).** Das vollständige Tech Design, Bau-Notizen, QA-Protokolle und der Deployment-Verlauf stehen unverändert im [Archiv](archive/PROJ-6-stripe-zahlungen.md).

> **Rückbau (2026-10-13):** Das Erzählzeit-Kontingent ist entfernt. Alle Vapi- und Sprechzeit-Kriterien weiter unten sind überholt.

> **Kauf ohne Konto (2026-11-16):** Checkout zuerst, Konto danach. Kriterien weiter unten, nach denen `/onboarding` nur für Angemeldete gilt, sind überholt.

## Refinement 2026-11-16 — Kauf ohne Konto (Checkout vor Login/Registrierung)
**Anlass (Betreiber, 2026-11-16):** Wer auf der Landingpage „Jetzt kaufen" klickt, soll sich nicht erst anmelden müssen. Zuerst der Checkout, danach Anmelden oder Registrieren.

### Ablauf
1. **Landingpage → `/onboarding`** ist ohne Anmeldung erreichbar. Der Kauf-Assistent fragt wie bisher nach Name und Geschenk-Variante; der letzte Schritt nennt für Gäste den nächsten Schritt („Nach der Zahlung legen Sie … Ihr Konto an").
2. **„Jetzt kaufen"** startet die Stripe-Checkout-Session ohne Konto. Die E-Mail-Adresse gibt der Gast im Checkout ein.
3. **Nach der Zahlung** zeigt `/kauf-erfolgreich` „Zahlung eingegangen — jetzt Konto anlegen" mit den Wegen „Konto erstellen" und „Ich habe bereits ein Konto" (E-Mail vorbelegt). Zusätzlich geht eine Mail „bitte legen Sie Ihr Konto an" an die Checkout-Adresse.
4. **Nach Registrierung bzw. Anmeldung** wird der Kauf über `/kauf-einloesen` dem Konto zugeordnet. Erst dann entstehen Projekt, 12-Monats-Zugang, Mitgliedschaft und ggf. die Einladung an die beschenkte Person. Danach folgt die gewohnte Bestätigungsseite.

Angemeldete Nutzer kaufen unverändert (Kauf wird sofort ihrem Konto zugeordnet). Die Verlängerung bleibt angemeldeten Projekt-Mitgliedern vorbehalten.

### Acceptance Criteria (Kauf ohne Konto)
- [x] `/onboarding` und `/kauf-erfolgreich` sind öffentliche Routen; der Assistent rendert für Gäste ohne Umleitung auf die Registrierung.
- [x] Gäste können ausschließlich den Erstkauf starten; „Verlängern" ohne Anmeldung wird serverseitig abgelehnt.
- [x] Die Angaben aus dem Assistenten werden serverseitig geprüft (Zod, Längen, E-Mail-Format der beschenkten Person).
- [x] Für Gäste trägt die Stripe-Session keine `user_id`, sondern `guest: "1"` und den SHA-256-Hash eines Einlöse-Geheimnisses (256 Bit Zufall). Das Geheimnis selbst liegt nur in einem httpOnly-Cookie (`nv_kauf`, SameSite=Lax, in Production `Secure`) im Browser des Käufers.
- [x] Der Webhook legt für bezahlte Gast-Käufe eine Zeile in `purchase_claims` an (idempotent über `stripe_session_id`) und verschickt die Mail „Konto anlegen". Es entsteht **kein** Projekt, kein Zugang, keine Einladung.
- [x] Einlösen darf nur, wer (a) mit der **bestätigten** E-Mail-Adresse des Checkouts angemeldet ist oder (b) das Einlöse-Geheimnis aus dem Käufer-Browser vorlegt. Alle Prüfungen laufen serverseitig über die Service-Role.
- [x] Ein Kauf wird genau einmal erfüllt (atomare Sperre `UPDATE … WHERE claimed_at IS NULL`, zusätzlich `payments.stripe_session_id UNIQUE`).
- [x] Scheitert die Erfüllung, bleibt der Anspruch offen, ein halb angelegtes Projekt wird entfernt, und der Nutzer sieht einen Hinweis statt einer Fehlerseite.
- [x] Trifft der Webhook später ein als der Käufer (Stripe garantiert keine Reihenfolge), prüft `/kauf-einloesen` die Session direkt bei Stripe und erfasst den Kauf selbst.
- [x] Konten ohne Projekt laufen nach der Anmeldung automatisch über `/kauf-einloesen`; gibt es nichts einzulösen, geht es wie bisher zum Assistenten. Bestandskunden mit offenem Kauf werden bei der Anmeldung ebenfalls dorthin geleitet.
- [x] `/kauf-einloesen` verlangt eine Anmeldung und merkt sich das Ziel (`/anmelden?next=/kauf-einloesen`).
- [x] **Stage-Datenbank:** Migration `20261116100000_proj6_purchase_claims.sql` eingespielt (2026-11-19 von Jakob über den SQL-Editor; geprüft: Tabelle mit RLS vorhanden, in der Migrations-Historie vermerkt).
- [ ] **Live-Durchlauf auf Stage** mit Stripe-Testmodus: Gast-Kauf → Mail → Registrierung → Projekt vorhanden (siehe „Offen").

### Entscheidungen
| Thema | Entscheidung | Begründung |
|---|---|---|
| Wann entsteht das Projekt? | Beim Einlösen, nicht bei der Zahlung | `projects.owner_id` ist Pflicht; ohne Konto gibt es keinen Eigentümer. Kein Eingriff in bestehende Tabellen oder RLS-Policies. |
| Ab wann laufen die 12 Monate? | Ab dem Einlösen (Konto-Anlage) | Der Käufer verliert keine Zeit, wenn er das Konto erst später anlegt. Die Mail nennt deshalb „12 Monate ab Einrichtung Ihres Kontos". |
| Geschenk-Einladung | Geht erst beim Einlösen raus | Vorher gibt es kein Projekt, dem die beschenkte Person beitreten könnte. Erfolgsseite und Mail sagen das ausdrücklich. |
| Kaufbestätigung bei Geschenk „Nur per Sprachnachricht erzählen" (2026-11-19, Jakob) | Mail wie beim Geschenk mit Zugang (Figma 03b), aber mit dem **Namen** der beschenkten Person. Auch die Erfolgsseite nennt den Namen. | Es gibt keine Einladung und noch keinen Kontaktweg. Der Käufer ist Projektleiter. |
| Geschenk ohne eigenen Zugang (2026-11-19, Jakob) | Der Käufer ist kein Projektmitglied. Bis zur Annahme ist niemand Projektleiter. Keine eigene Seite und kein Button für den Käufer. | Bewusster Verzicht auf Zugang. Meldet er sich an, landet er im Kauf-Assistenten (akzeptiert). |
| Gültigkeit der Geschenk-Einladung (2026-11-18) | So lange wie der Portal-Zugang des Projekts (`project_access.expires_at`), nicht 14 Tage | Geschenke werden oft lange vor der Übergabe gekauft, und ohne Mitglied könnte niemand die Einladung erneuern. 256-Bit-Token, Annahme nur mit der eingeladenen Adresse. |
| Zuordnung per E-Mail | Nur mit bestätigter Adresse | Sonst könnte jemand ein Konto mit fremder Adresse anlegen und den Kauf an sich ziehen. |
| Zuordnung per Browser-Geheimnis | Zusätzlich zur E-Mail | Deckt den Fall ab, dass im Checkout eine andere Adresse steht als im Konto (z. B. PayPal-Adresse). |
| Neue Tabelle statt Spalten | `purchase_claims`, RLS ohne Policies | Zahlungsbezug und E-Mail-Adressen von Personen ohne Konto; nur der Server liest und schreibt (Muster wie `project_access`, `mail_log`). |

## Refinement 2026-10-13 — Rückbau Erzählzeit-Kontingent
**Anlass:** Vapi wird durch Audio-Sprachnachrichten ersetzt ([PROJ-12](PROJ-12-audio-erzaehlpipeline.md)). Erzählen ist im Portal-Zugang enthalten; es gibt kein Zeit-Kontingent und kein Nachkauf-Produkt mehr. PROJ-6 umfasst damit nur noch **Portal-Zugang Initial (249 €)** und **Verlängerung (99 €)**.

### Acceptance Criteria (Rückbau)
- [x] Das Produkt „Vapi +60 Min" ist nicht mehr kaufbar: Checkout akzeptiert nur noch `initial` und `renewal`; ein Aufruf mit dem alten Produkt-Typ wird serverseitig abgelehnt.
- [x] Die Stat-Karte „Telefonzeit übrig" inkl. „Nachkaufen"-Button ist aus der Projektübersicht entfernt; die Karte „Projektzugang endet in" bleibt.
- [x] Die Guthaben-Berechnung (`36 000 + Top-ups × 3 600 − Verbrauch`) ist entfernt.
- [x] Der Webhook verarbeitet keine neuen Vapi-Käufe mehr; ein dennoch eintreffendes Altereignis wird protokolliert und ohne Fehler quittiert.
- [x] Bestätigungsseite `/kauf-erfolgreich` und Abbruch-Pfade kennen nur noch Initial (selbst / Geschenk) und Verlängerung.
- [x] Onboarding-Kaufschritt und Kauf-Mail nennen keine „10 Stunden Vapi-Erzählzeit" mehr (neuer Text siehe PROJ-12).
- [x] Kauf-Mail „Vapi-Paket" und zugehöriger Versand-Helper sind entfernt (PROJ-11).
- *Nach PROJ-12 verschoben (kein PROJ-6-Kriterium mehr):* Der Checkout nimmt die neuen Onboarding-Angaben (Erzählweise, Kontaktwege, Wochentag) entgegen und der Webhook speichert sie beim Anlegen des Projekts.
- [x] Altbestand: Der Zahlungstyp `vapi_voice_minutes_60` bleibt in der Datenbank bestehen (bestehende Zahlungen bleiben als Beleg im persönlichen Bereich sichtbar), wird aber nicht mehr neu vergeben.
- [x] `STRIPE_PRICE_ID_VAPI_60` und `VAPI_API_KEY` sind aus `.env.local.example` und der Vercel-Konfiguration entfernt; das Stripe-Produkt ist im Stripe-Dashboard archiviert. — *Repo: erledigt. Vercel-Env + Stripe-Dashboard: vom Nutzer am 2026-10-13 als erledigt bestätigt.*
- [x] Unit- und E2E-Tests zum Vapi-Pfad sind entfernt bzw. auf „wird abgelehnt" umgestellt.

## Status: Approved
**Created:** 2026-05-15
**Last Updated:** 2026-11-22 (QA Kauf ohne Konto + Verlängerung abgeschlossen, Live-Test auf Stage bestanden; Low-Befunde G8, G10, G11 offen)

## Dependencies
- Requires: PROJ-2 (Auth + SSR) — Session, Onboarding-Wizard-Daten, Middleware
- Requires: PROJ-1 (Supabase-Datenmodell & RLS) — `payments`, `invitations`, `project_members`, `projects`, `voice_sessions`-Tabellen
- Requires: PROJ-4 (Kapitel-Routing & Persistenz) — Projektübersicht als Einstiegspunkt für die Verlängerung

## User Stories
- Als Käufer möchte ich nach dem Onboarding-Wizard sicher per Stripe bezahlen, damit mein Portal-Zugang sofort aktiv ist.
- Als Käufer möchte ich nach erfolgreicher Zahlung eine klare Bestätigungsseite sehen, damit ich weiß, dass alles geklappt hat.
- Als Projektleiter möchte ich meinen Portal-Zugang direkt aus der Projektübersicht verlängern, damit ich nie unvorbereitet ausgesperrt werde.
- Als Geschenkkäufer möchte ich, dass die Einladung an die beschenkte Person automatisch nach Zahlung verschickt wird, damit ich nichts manuell erledigen muss.

## Acceptance Criteria

### Sicherheits-Blocker (aus PROJ-1 BUG-2, High)
Das Ablaufdatum darf für angemeldete Clients nie schreibbar sein, sonst ist die Bezahlschranke umgehbar. Umgesetzt mit der Tabelle `project_access` (RLS an, nur Lesen für Mitglieder) in `20260521120000_proj6_paywall_lockdown.sql`. Der Negativtest liegt in `tests/PROJ-6-zugriffsregeln.spec.ts`.

### Webhook-Sicherheit (verpflichtend, kein Kompromiss)
- [ ] Webhook-Route läuft mit `runtime = 'nodejs'` (nicht Edge), liest Body als Raw-String (`await req.text()`)
- [ ] `stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret)` wird **vor jeder DB-Operation** aufgerufen; ungültige Signatur → `return new Response(null, { status: 400 })`
- [ ] Webhook-Route ist im Middleware-Matcher **ausgenommen** (Stripe sendet keine User-Session; sonst 302-Redirect statt 400)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` wird ausschließlich in dieser Route (und in PROJ-11 Mail-Sender) verwendet, **niemals** mit `NEXT_PUBLIC_`-Prefix; `.env.local.example` dokumentiert das mit Dummy-Wert und Warnkommentar
- [ ] Idempotenz-Check: vor jedem Write `SELECT 1 FROM payments WHERE stripe_session_id = $1` — wenn vorhanden, 200 OK ohne weitere Schreibvorgänge

### Produkte & Preise
- [ ] 2 kaufbare Produkte in Stripe konfiguriert: **Portal-Zugang Initial** (249 €, 12 Monate), **Portal-Zugang Verlängerung** (99 €, 12 Monate)
- [ ] Alle Preise in EUR; keine Abonnements (Einmalkauf)

### Einstiegspunkte
- [ ] "Jetzt kaufen"-CTA am Ende des Onboarding-Wizards (PROJ-2) → startet Checkout für **Portal-Zugang Initial**
- [ ] Stat-Karte "NARRAVIT-Projektzugang endet in" in `/projektuebersicht/[project_id]` → Verlängerungs-Button → startet Checkout für **Portal-Zugang Verlängerung** (mit `project_id`)
- [ ] Die Verlängerung ist **ausschließlich** über die Projektübersicht zugänglich (nicht über `/persoenlicher-bereich`)

### Stripe Hosted Checkout
- [ ] Alle Checkouts laufen über Stripe Hosted Checkout (Weiterleitung auf stripe.com)
- [ ] `success_url`: `/kauf-erfolgreich` (inkl. Stripe `session_id` als Query-Parameter zur serverseitigen Verifikation)
- [ ] `cancel_url` für Initial-Kauf: `/onboarding`; für Verlängerung: `/projektuebersicht/[project_id]`
- [ ] Onboarding-Konfiguration (Geschenkdaten, Rollen, Buyer-Zugang) wird als Stripe-Checkout-Metadata übergeben, damit der Webhook die korrekte Projektstruktur anlegt

### Erfolgsseite `/kauf-erfolgreich`
- [ ] Seite ist serverseitig verifiziert: `session_id` aus URL → Stripe API; direkte Aufrufe ohne gültige `session_id` → Redirect zu `/`
- [ ] **Initial-Kauf (für mich selbst):** Überschrift "Willkommen bei NARRAVIT!", Text "Dein Zugang ist aktiv — viel Freude beim Schreiben.", Button "Jetzt starten" → `/`
- [ ] **Initial-Kauf (Geschenk):** Wie oben, zusätzlich Hinweis "Die Einladung wurde an [E-Mail] verschickt — sobald sie angenommen wird, kann die beschenkte Person loslegen."
- [ ] **Verlängerung:** Bestätigung "Kauf erfolgreich — dein Konto wurde aktualisiert.", Button "Zurück zum Projekt" → `/projektuebersicht/[project_id]`

### Abbruch
- [ ] Abbruch Initial-Kauf → `/onboarding` + Toast "Zahlung nicht abgeschlossen — du kannst es erneut versuchen."
- [ ] Abbruch Verlängerung → `/projektuebersicht/[project_id]` + Toast "Kauf nicht abgeschlossen."

### Stripe Webhook (`checkout.session.completed`)
- [ ] Webhook-Endpunkt verarbeitet `checkout.session.completed`
- [ ] Webhook-Signatur wird serverseitig verifiziert (Stripe-Webhook-Secret); ungültige Signaturen → 400
- [ ] Idempotenz: `payments.stripe_session_id UNIQUE` verhindert doppelte Einträge bei Webhook-Retries

**Initial-Kauf (249 €):**
- [ ] Neues Projekt anlegen: `title = "Lebensgeschichten"`, `portal_access_expires_at = now() + 12 Monate`
- [ ] `payments`-Eintrag anlegen (type = `initial_portal_access`, status = `completed`)
- [ ] "Für mich selbst" **oder** "Als Geschenk — Nur Telefon": Käufer → `project_members` als `projektleiter`
- [ ] "Als Geschenk — Auch Computer" + Käufer behält Zugang: Käufer → `project_members` als `projektleiter`; `invitations`-Eintrag für Empfänger anlegen (PROJ-11 verschickt die E-Mail)
- [ ] "Als Geschenk — Auch Computer" + Käufer verzichtet auf Zugang: Käufer **nicht** in `project_members`; `invitations`-Eintrag für Empfänger anlegen mit Rolle `projektleiter` (PROJ-11 verschickt die E-Mail)

**Portal-Verlängerung (99 €):**
- [ ] `projects.portal_access_expires_at` = aktuelles Ablaufdatum + 12 Monate (kein Zeitverlust)
- [ ] `payments`-Eintrag anlegen (type = `portal_access_renewal`, status = `completed`)


## Edge Cases
- Webhook trifft ein, bevor der Nutzer `/kauf-erfolgreich` aufruft → Projekt ist bereits angelegt; Erfolgsseite liest State über Stripe API (session_id), nicht aus der DB
- Doppelter Webhook-Call (Stripe-Retry) → `payments.stripe_session_id UNIQUE` verhindert doppelten Eintrag; kein zweites Projekt angelegt
- Käufer schließt Browser nach Checkout, ohne `/kauf-erfolgreich` zu sehen → Webhook hat ausgelöst; Zugang ist aktiv; nächster Login landet auf `/` mit aktivem Projekt
- Empfänger-E-Mail beim Geschenk-Kauf existiert bereits als Supabase-User → Webhook legt `invitations`-Eintrag trotzdem an; PROJ-11 handhabt den Spezialfall bei der E-Mail-Zustellung
- Käufer verlängert Zugang, obwohl er noch > 30 Tage aktiv ist → Verlängerung wird trotzdem verarbeitet; kein serverseitiger Block
- Portal-Verlängerung für Projekt, bei dem der Käufer keinen `project_members`-Eintrag hat (Geschenk, Zugang verzichtet) → Verlängerung nur durch den beschenkten `projektleiter` möglich (einziges Mitglied mit Projektzugang)
- Webhook schlägt wegen DB-Fehler fehl → Stripe retried; Idempotenz verhindert Duplikate; falls Projekt bereits angelegt: Update statt Insert

## Technical Requirements
- Sicherheit: Stripe-Webhook-Signatur serverseitig mit `stripe.webhooks.constructEvent` verifiziert; ungültige Requests mit 400 ablehnen
- Sicherheit: Stripe Secret Key, Webhook-Secret und `SUPABASE_SERVICE_ROLE_KEY` ausschließlich serverseitig (Env-Variablen); niemals im Client exponiert; niemals als `NEXT_PUBLIC_*`
- Sicherheit: Paywall-Spalten (`portal_access_expires_at` etc.) niemals als Spalte in einer für Mitglieder UPDATE-baren Tabelle — separate Tabelle mit reinem `service_role`-Write (siehe Sicherheits-Blocker oben)
- Idempotenz: `payments.stripe_session_id UNIQUE` (aus PROJ-1) ist die einzige Duplikat-Schutzmaßnahme — kein eigenes Locking nötig
- `/kauf-erfolgreich` ruft Stripe API serverseitig auf (session_id → Session-Objekt) zur Verifikation; keine DB-Query als primäre Datenquelle für den Erfolgsfall
- Abhängigkeit PROJ-11: Einladungs-E-Mails werden durch PROJ-11 (Resend) verschickt; PROJ-6 legt nur den `invitations`-Eintrag in der DB an

## Technische Entscheidungen
_Kurzform. Die vollständige Begründung steht im Archiv._

### H) Tech-Entscheidungen (Begründungen)

1. **Stripe Hosted Checkout statt Stripe Elements** — Geringere Compliance-Last (PCI-DSS), kein eigenes Bezahlformular, Stripe pflegt die Card-Sicherheit.
2. **Webhook in Node-Runtime, nicht Edge** — Stripe-Signaturen verlangen byte-genauen Raw-Body, was Edge-Runtime nicht garantiert.
3. **`project_access` als separate Tabelle** — Verschließt das Loch aus PROJ-1 BUG-2 (jeder co_author könnte sich unbegrenzten Zugang setzen).
4. **Server-Action statt API-Route für `startCheckout`** — Nutzt Next.js' built-in CSRF-Schutz, eingeloggter User automatisch verfügbar via `auth.getUser()`.
5. **Stripe-API als primäre Datenquelle der Erfolgsseite** — Vermeidet Race-Condition zwischen Webhook-Eintreffen und User- Browser-Rückkehr. DB ist eventually consistent.
6. **Einmalkauf statt Subscriptions** — Produktentscheidung aus PRD/Roadmap; Subscriptions würden zusätzlichen Webhook-Flow (`invoice.paid`, `customer.subscription.updated`) erfordern, der PROJ-6-Scope sprengt.
7. **`/kauf-erfolgreich` als ServerComponent (nicht Client)** — Stripe API-Call braucht Secret Key → server-only. Vermeidet eine separate API-Route.

### Spätere Entscheidungen
- **Persönlicher Einlöse-Link (BUG-G12, von Jakob freigegeben):** Die Kauf-Mail enthält einen Link mit eigenem Geheimnis (256 Bit, nur als Hash gespeichert). Er ordnet den Kauf jedem eigenen Konto zu, auch auf einem anderen Gerät. Eingelöst wird nach der Anmeldung und genau einmal.
- **Geschenk ohne eigenen Zugang (Jakob, 2026-11-21):** Wer es ohne Anmeldung kauft, legt kein Konto an. Der Webhook richtet Projekt, Zugang und Einladung direkt ein. Das Projekt hat bis zur Annahme keinen Eigentümer, die beschenkte Person wird beim Annehmen Projektleitung und Eigentümer.
- **Abgelaufene Projekte:** Sie sind auch in der Datenbank schreibgeschützt. Lesen, Löschen, Verlassen und Verlängern bleiben möglich (`20261122180000_proj6_access_rules.sql`, RLS-Änderung von Jakob freigegeben).
- **Projekte und Mitglieder entstehen nur über den Server,** also über Kauf oder Einladung. Die früheren Insert-Policies sind entfernt (G14, G15).
- **Zugangsdauer:** 12 echte Kalendermonate, auch über einen 29. Februar. Als bezahlt gilt `paid` oder `no_payment_required` mit Betrag 0. Verzögerte Zahlarten laufen über `checkout.session.async_payment_succeeded`.
- **Wortlaut:** durchgehend „Projektzugang“, bei Geschenken „Geschenk versenden/empfangen“.

## Offene Punkte
- Landingpage: Der Button „Jetzt kaufen“ muss auf `<App-URL>/onboarding` zeigen (optional `?for=self` oder `?for=gift`), nicht auf `/registrieren`.
- Nicht eingelöste Käufe: Wer bezahlt und nie ein Konto anlegt, bekommt genau eine Mail. Eine Erinnerung und eine Übersicht für den Kundenservice fehlen.
- Datenschutz: Die Checkout-Adresse von Käufern ohne Konto und das Cookie `nv_kauf` gehören in die Datenschutzerklärung.
- BUG-G8 (Low): Bricht der Server zwischen Sperre und Erfüllung ab, bleibt ein Kauf als eingelöst ohne Projekt stehen und ist nur von Hand lösbar.
- BUG-G10 (Low): Die Erfolgsseite legt die Checkout-Adresse als `?email=` in die Links zu Registrierung und Anmeldung.
- BUG-G11 (Low): Erstattungen (`charge.refunded`) werden nicht verarbeitet. Produktentscheidung offen.
- BUG-G5, Rest: Zahlen zwei verschiedene Mitglieder im selben Moment, kann eine Verlängerung verloren gehen. Vollständig atomar ginge es nur mit einer Datenbank-Funktion.
- BUG-R2 (Low): Eine noch offene alte Vapi-Session wird ohne `payments`-Eintrag quittiert.
- Vor dem Go-live: Preis im Stripe-Dashboard von 199 € (Testmodus) auf 249 € stellen, Stripe-Werte für Production in Vercel setzen (ohne Anführungszeichen), Coupons getrennt für Test und Live pflegen, Rechtstext-URLs und Steuerbehandlung im Checkout klären.
- Der Live-Durchlauf auf Stage ist seit 2026-11-22 bestanden. Der automatische Tageslauf des Crons ist erst nach dem Merge auf `main` prüfbar.
