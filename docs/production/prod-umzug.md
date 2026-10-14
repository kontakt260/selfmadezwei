# Prod-Umzug — Stage → Production

> **Zweck:** Wir bauen und testen alles auf Stage (`stage-app.narravit.de`). Diese Datei sammelt **jede** Einstellung, die für Production anders sein oder dort noch erledigt werden muss — damit der Umzug am Ende lückenlos klappt.
>
> **Pflege-Regel (Anforderung 2026-10-14):** Wer auf Stage eine Env-Variable, einen Schlüssel, eine Adresse, einen Webhook, eine Supabase-/Stripe-/Resend-Einstellung, eine Domain oder einen Rechtstext anlegt oder ändert, trägt das **im selben Arbeitsschritt** hier ein. Nie Secret-Werte eintragen — nur Name, Ort und was in Production gesetzt werden muss.

**Stand:** 2026-10-14

---

## 1. Ablauf am Umzugstag

Reihenfolge so wählen, dass Production nie halb konfiguriert Kunden sieht:

1. Vorbedingungen aus Abschnitt 9 erfüllt (Rechtstexte, Go-live-Blocker).
2. **Supabase Production** einrichten (Abschnitt 3): Migrationen + Seed, Auth-URLs, SMTP, Mail-Vorlagen, OAuth.
3. **Stripe Live-Modus** einrichten (Abschnitt 4): Produkte, Webhook, Schlüssel.
4. **Resend** Production-Schlüssel anlegen (Abschnitt 5).
5. **Vercel Production-Variablen** setzen (Abschnitt 2), Domain `app.narravit.de` prüfen.
6. `stage` → `main` mergen (über `/deploy`, nur mit ausdrücklicher Freigabe).
7. Smoke-Tests (Abschnitt 10).

---

## 2. Vercel (Projekt `app-narravit`)

### Umgebungsvariablen

Production-Werte in Vercel unter **Settings → Environment Variables** mit Scope **Production** setzen. Secrets als *Sensitive* markieren.

| Variable | Stage | Production | Hinweis |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://stage-app.narravit.de` | `https://app.narravit.de` | Basis für Mail-Links, Stripe-Rückleitung, Auth-Redirects. Kein `/` am Ende. |
| `NEXT_PUBLIC_SUPABASE_URL` | URL des Stage-Projekts (`kdjhxqitfxnsavhiafdn`) | URL des Production-Projekts | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Stage-Anon-Key | Production-Anon-Key | |
| `SUPABASE_SERVICE_ROLE_KEY` | Stage-Service-Role | Production-Service-Role | Sensitive. Nur serverseitig. |
| `STRIPE_SECRET_KEY` | `sk_test_…` | `sk_live_…` | Sensitive. |
| `STRIPE_WEBHOOK_SECRET` | Secret des Stage-Webhooks (Test-Modus) | Secret des Live-Webhooks | Sensitive. Jeder Webhook-Endpunkt hat ein eigenes Secret. |
| `STRIPE_PRICE_ID_INITIAL` | Test-Preis | Live-Preis 249 € | Preis-IDs unterscheiden sich zwischen Test und Live. |
| `STRIPE_PRICE_ID_RENEWAL` | Test-Preis | Live-Preis 99 € | |
| `RESEND_API_KEY` | Schlüssel `narravit-app-stage` | eigener Schlüssel `narravit-app-prod` | Sensitive. Sending access, Domain `mail.narravit.de`. |
| `EMAIL_TEST_RECIPIENT` | `kontakt@narravit.de` | **nicht setzen** | Leitet alle Mails um. Wird in Production zwar ignoriert, soll dort trotzdem fehlen. |
| `EMAIL_FROM` | nicht gesetzt (Fallback) | optional | Fallback im Code: `narravit <no-reply@mail.narravit.de>`. Absender muss auf `mail.narravit.de` liegen. |
| `CRON_SECRET` | eigener Zufallswert | **neuer** Zufallswert | Sensitive. Erzeugen: `openssl rand -base64 32`. |

Automatisch von Vercel gesetzt, nichts zu tun: `VERCEL_ENV` (`production` auf Production — schaltet `EMAIL_TEST_RECIPIENT` ab).

Entfallen, in Production **nicht** anlegen: `STRIPE_PRICE_ID_VAPI_60`, `VAPI_API_KEY` (Vapi-Rückbau 2026-10-13).

### Weitere Vercel-Einstellungen

- [ ] Domain `app.narravit.de` ist der Production-Domain zugeordnet (DNS siehe Abschnitt 7).
- [ ] Deployment Protection (Vercel-Login) gilt nur für Stage/Preview, **nicht** für Production.
- [ ] Cron `/api/cron/reminders` (täglich 09:00 UTC, `vercel.json`): läuft **nur in Production**. Nach dem ersten Lauf in den Vercel-Logs prüfen, dass er mit 200 antwortet.

---

## 3. Supabase

Stage = Projekt-Ref `kdjhxqitfxnsavhiafdn`. Production = Haupt-Projekt (`main`) — Zuordnung vor dem Umzug im Dashboard bestätigen. Claude hat bewusst **keinen** Zugriff auf Production-Daten — Migrationen in Production spielt der Betreiber ein (Branch-Merge oder SQL-Editor).

### Datenbank

- [ ] Alle Migrationen aus `supabase/migrations/` in Production angewendet (Stand 2026-10-14: 14 Dateien, letzte `20260525190000_proj11_mail_log.sql`). Mit `list_migrations` bzw. im Dashboard gegen das Repo abgleichen.
- [ ] Seed `supabase/seed.sql` (15 Erzähl-Impulse) in Production eingespielt; Leitfragen kommen aus der Migration `proj8_impulse_leading_questions`.
- [ ] Storage-Buckets aus `20260515200002_storage_buckets.sql` vorhanden (4 private Buckets).
- [ ] Testdaten **nicht** übernehmen: QA-Konto `qa-test@narravit.de`, Test-Projekte, Test-Zahlungen bleiben auf Stage.

### Auth → URL Configuration

- [ ] Site URL: `https://app.narravit.de`
- [ ] Redirect URLs: `https://app.narravit.de/auth/callback**` (die App leitet alle Mail- und OAuth-Links über `/auth/callback?next=…`).

### Auth → SMTP (Mails über Resend)

- [ ] Custom SMTP aktiv: Host `smtp.resend.com`, Port 465, User `resend`, Passwort = eigener Resend-Schlüssel für Supabase-Production (nicht den App-Schlüssel teilen).
- [ ] Absender-Adresse und -Name wie auf Stage übernehmen (Adresse auf `mail.narravit.de`).
- [ ] Mail-Rate-Limit unter Auth → Rate Limits passend setzen (mit eigenem SMTP frei wählbar).

### Auth → Email Templates

- [ ] „Confirm signup" und „Reset password" aus `supabase/templates/` einsetzen (erzeugt aus `src/emails/auth/`). **Stand:** auf Stage noch nicht eingesetzt, Design wird überarbeitet (Backlog).
- [ ] Platzhalter für Pflichtangaben in den Vorlagen (`LEGAL_PLACEHOLDER`) durch echte Angaben ersetzen.
- [ ] Ohne diese Vorlagen funktionieren Mail-Links nur im selben Browser (PKCE-Code statt Token-Hash) — für Production Pflicht.

### Auth → Providers

- [ ] **Google:** Provider aktiv; im Google-Cloud-OAuth-Client die Callback-URL des Production-Projekts (`https://<prod-ref>.supabase.co/auth/v1/callback`) als autorisierte Weiterleitungs-URI eintragen; OAuth-Zustimmungsbildschirm veröffentlicht („In production"), sonst nur Testnutzer.
- [ ] **Facebook:** Provider aktiv; in der Meta-App die Production-Callback-URL eintragen; App in den Live-Modus schalten (verlangt Datenschutz-URL und Datenlöschungs-URL).
- [ ] **Apple:** noch nicht gebaut (eigenes Ticket); später hier ergänzen.

---

## 4. Stripe

Stage läuft im **Test-Modus**. Production braucht den **Live-Modus** — alle Objekte dort neu anlegen.

- [ ] Stripe-Konto für Live-Zahlungen aktiviert (Unternehmensdaten, Bankkonto).
- [ ] Produkte im Live-Modus: „Portal-Zugang" **249 €** und „Portal-Zugang Verlängerung" **99 €** (Einmalzahlung). Hinweis: Der Test-Preis für den Erstkauf stand zuletzt auf 199 €.
- [ ] Kein Vapi-Produkt anlegen (archiviert).
- [ ] Webhook-Endpunkt im Live-Modus: `https://app.narravit.de/api/stripe/webhook`, Event `checkout.session.completed` → Secret in `STRIPE_WEBHOOK_SECRET`.
- [ ] Promotion-Codes/Coupons im Live-Modus anlegen, falls gewünscht (Checkout erlaubt Codes: `allow_promotion_codes: true`).
- [ ] Checkout-Einstellungen: Links zu AGB und Datenschutz hinterlegen.
- [ ] MwSt.: Stripe Tax aktivieren oder Preise ausdrücklich als Brutto-Endpreise führen (offene Entscheidung).
- [ ] Rechnungen: Checkout erzeugt derzeit keine Rechnungen; die Kauf-Mail zeigt den Rechnungs-Link nur, wenn eine Rechnung existiert (offene Entscheidung, PROJ-11 BUG-7).

---

## 5. Resend (Transaktionsmails)

- [ ] Domain `mail.narravit.de` ist verifiziert (DKIM `resend._domainkey.mail.narravit.de`, SPF/MX auf `send.mail.narravit.de`) — gilt für Stage und Production. Die Hauptdomain `narravit.de` ist **nicht** in Resend eingerichtet; Absender dort würden abgelehnt.
- [ ] Eigener API-Schlüssel `narravit-app-prod` (Sending access, nur `mail.narravit.de`) → Vercel `RESEND_API_KEY` (Production).
- [ ] Eigener Schlüssel für Supabase-SMTP in Production (Abschnitt 3).
- [ ] Stage-Schlüssel bleiben auf Stage; beim Umzug nicht wiederverwenden.
- [ ] Suppression-Liste prüfen: Adressen aus Tests (z. B. `qa-test@narravit.de`) stehen dort; echte Kundenadressen dürfen nicht darauf landen.

---

## 6. Mail-Adressen

| Zweck | Adresse | Wo eingetragen |
|---|---|---|
| Absender App-Mails | `no-reply@mail.narravit.de` | Code-Fallback bzw. `EMAIL_FROM` |
| Absender Supabase-Auth-Mails | Adresse auf `mail.narravit.de` | Supabase → Auth → SMTP |
| Support / Kontakt in allen Mails | `kontakt@narravit.de` | `src/emails/Layout.tsx` (Footer), Willkommens-Mail |
| Test-Empfänger Stage | `kontakt@narravit.de` | Vercel `EMAIL_TEST_RECIPIENT` (nur Stage) |

`narravit.de` selbst läuft über Google Workspace (Postfach `kontakt@`) — unabhängig von Resend.

---

## 7. Domains & DNS

- [ ] `app.narravit.de` → Vercel (Production).
- [ ] `stage-app.narravit.de` bleibt auf Stage.
- [ ] Website `narravit.de` / `www.narravit.de`: liefert Stand 2026-10-14 überall 404 (Webflow nicht veröffentlicht). Vor Go-live muss sie erreichbar sein, falls Mails oder App dorthin verlinken.

---

## 8. Rechtliches

- [ ] Impressum — Seite `/impressum` in der App (PROJ-11 BUG-1; der Footer jeder Mail verlinkt `<SITE_URL>/impressum`). Angaben vom Betreiber offen.
- [ ] Datenschutzerklärung (auch für Facebook-App und Stripe-Checkout nötig).
- [ ] AGB und Widerrufsbelehrung für den Kauf.
- [ ] Pflichtangaben in den Supabase-Mail-Vorlagen (Abschnitt 3).
- [ ] Kein Abmelde-Link in Erzähl-Aufforderungen (Produktentscheidung) — rechtlich prüfen lassen (PROJ-12).

---

## 9. Go-live-Blocker (Features)

- [ ] PROJ-17 Rate-Limiting für Auth-Endpunkte (bringt eigene Env-Variablen mit — dann hier ergänzen).
- [ ] PROJ-19 Production-Hardening (Security-Header, Env-Prüfung beim Start).
- [ ] PROJ-12 Audio-Erzählen live, sonst Mail-Texte zum „Erzählen per Sprachnachricht" anpassen (PROJ-11 BUG-9). Bringt SMS-Anbieter (seven.io) und Transkriptions-/LLM-Schlüssel mit — dann hier ergänzen.
- [ ] PROJ-13 Fehler-Monitoring (Sentry) — dann `SENTRY_DSN` o. ä. hier ergänzen.

---

## 10. Smoke-Tests nach dem Umzug

- [ ] Registrierung mit E-Mail: Bestätigungs-Mail kommt an, Link funktioniert auch in einem anderen Browser, Willkommens-Mail kommt.
- [ ] Anmeldung mit Google und mit Facebook.
- [ ] „Passwort vergessen" für ein E-Mail-Konto und für ein Google-Konto.
- [ ] Echter Kauf (kleiner Betrag per Promotion-Code oder sofortige Erstattung): Projekt entsteht, Kauf-Mail kommt, Webhook in Stripe als zugestellt markiert.
- [ ] Geschenk-Kauf „Auch am Computer schreiben": Einladung an die beschenkte Person kommt an.
- [ ] Einladung über „Nutzer hinzufügen" kommt an.
- [ ] Cron `/api/cron/reminders` nach dem ersten Lauf in den Vercel-Logs mit 200.
- [ ] Mail-Links zeigen auf `app.narravit.de`, nicht auf `stage-app`.

---

## Änderungsprotokoll

| Datum | Eintrag |
|---|---|
| 2026-10-14 | Datei angelegt mit dem Stand aus PROJ-1, -2, -6, -11 (Env-Variablen, Supabase-Auth, Stripe, Resend, Rechtliches). Stage-Mail-Variablen `RESEND_API_KEY`, `CRON_SECRET`, `EMAIL_TEST_RECIPIENT` werden eingerichtet. |
