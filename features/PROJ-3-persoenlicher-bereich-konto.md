# PROJ-3: Persönlicher Bereich + Konto

> **Kurzfassung (PROJ-31).** Das vollständige Tech Design, Bau-Notizen, QA-Protokolle und der Deployment-Verlauf stehen unverändert im [Archiv](archive/PROJ-3-persoenlicher-bereich-konto.md).

## Status: Approved

> Der Bereich **Account löschen** wurde neu gebaut (Refine 2026-11-22), die QA ist bestanden, der Code ist noch nicht deployed. Alle anderen Sektionen bleiben unverändert wie deployed.

**Created:** 2026-05-15
**Last Updated:** 2026-11-22 — Refined: Konto-Löschen neu geregelt, siehe „Refine 2026-11-22". Davor 2026-05-21 — Refined: Email-Edit + Apple-OAuth revert (Commit `02cf7d8` ⇄ `942f97a`); „Mein Zugang"-Sektion entfernt (Info ab PROJ-6 in Projektübersicht); Delete-Button-Label vereinfacht.

## Dependencies
- Requires: PROJ-2 (Auth + SSR) — für Session und OAuth-Provider-Erkennung
- Requires: PROJ-1 (Supabase-Datenmodell & RLS) — für `profiles` und `project_members`
- Soft dependency: PROJ-6 (Stripe-Zahlungen) — Rechnungsliste benötigt Stripe-Integration; Sektion ist in PROJ-3 als Placeholder angelegt, Stripe-Daten kommen mit PROJ-6
- Verwandt: PROJ-9 (Mitglieder, Rollen, Verlassen eines Projekts), PROJ-11 (Mail an die Nachfolge)
- Eigene Specs, noch zu schreiben: PROJ-26 Papierkorb für Kapitel und Projekte, PROJ-27 Zustimmung zu den AGB

## User Stories
- Als eingeloggter Nutzer möchte ich meinen Namen jederzeit ändern können, damit meine Anzeige in der App aktuell bleibt.
- Als Nutzer möchte ich eine Liste meiner bisherigen Zahlungen einsehen, damit ich Rechnungen für die Buchhaltung herunterladen kann.
- Als E-Mail+Passwort-Nutzer möchte ich mein Passwort direkt aus dem Konto-Bereich zurücksetzen können, damit ich nicht zur Anmeldeseite navigieren muss.
- Als Nutzer möchte ich meinen Account unwiderruflich löschen können, aber erst nach einer expliziten Bestätigung, damit versehentliche Löschungen verhindert werden.
- Als Mitglied eines gemeinsamen Projekts möchte ich, dass unser Buch bestehen bleibt, wenn eine andere Person ihr Konto löscht, damit niemand meine Texte durch eine eigene Kontolöschung vernichten kann.
- Als einzige Projektleitung möchte ich beim Löschen meines Kontos eine Nachfolge bestimmen, damit das Buch weitergeführt werden kann und ich trotzdem jederzeit gehen kann.

> **Bewusst ausgeklammert:** E-Mail-Adresse-Selbstbedienungs-Änderung (siehe Implementation Notes 2026-05-21). E-Mail-Wechsel läuft aktuell über den Support.

## Acceptance Criteria

### Seite & Layout
- [ ] Seite unter `/persoenlicher-bereich` (geschützte Route, Anmeldung erforderlich; auch mit abgelaufenem Zugang oder ohne Projekt erreichbar und von `/zugang-abgelaufen` aus verlinkt, damit das Konto immer gelöscht werden kann)
- [ ] Banner-Bild oben, Seitenüberschrift "Persönlicher Bereich" mit Untertitel
- [ ] **4 Sektionen** in dieser Reihenfolge: Account-Übersicht, Rechnungen, Sicherheit, Account löschen
- [ ] Responsives Layout (1 Spalte Mobile, Grid auf Desktop) analog zur alten App

### Sektion: Account-Übersicht
- [ ] **Zwei Felder:** Name (editierbar) + E-Mail (read-only)
- [ ] **Name speichern:** separater Button "Name speichern"; schreibt `profiles.full_name`; Erfolgs-Toast nach Save; Pflichtfeld, min. 2 Zeichen
- [ ] **E-Mail:** read-only, `tabIndex={-1}`, value aus `auth.users.email`; Hinweis-Text „Um Ihre E-Mail-Adresse zu ändern, wenden Sie sich bitte an den Support."
- [ ] Kein eigenes „Mitglied seit"-Feld (Spec-Vereinfachung — Registrierungsdatum ist nicht produkt-kritisch und steht in Stripe-Rechnungen ohnehin sichtbar)

### Sektion: Rechnungen
- [ ] Slim inline-Liste aller abgeschlossenen Zahlungen; Daten kommen direkt aus Stripe (kein separates Lesen der `payments`-Tabelle für die Anzeige)
- [ ] Jede Zeile: Datum, Betrag + Währung, Zahlungstyp (z. B. "Portal-Zugang 12 Monate", "Verlängerung", "Vapi-Sprechzeit +60 Min"), "Rechnung herunterladen"-Link (Stripe-hosted PDF)
- [ ] Leerzustand: "Noch keine Rechnungen vorhanden" (tritt in der Praxis selten auf, da Portal-Zugang Kauf voraussetzt)
- [ ] Stripe-Integration (tatsächliche Daten + Download-Links) wird mit PROJ-6 aktiviert; in PROJ-3 wird die Sektion mit Platzhalter-State gebaut

### Sektion: Sicherheit
- [ ] Für E-Mail+Passwort-Nutzer: Button "Passwort zurücksetzen" — löst denselben Supabase Reset-Link-Flow wie `/passwort-vergessen` (PROJ-2) aus; nach Klick: Hinweis "Wir haben dir einen Link zum Zurücksetzen geschickt"
- [ ] Für OAuth-Nutzer (Google/Facebook): Passwort-Button wird ausgeblendet; stattdessen Hinweis: "Du meldest dich über Google / Facebook an — Passwort-Verwaltung erfolgt dort"
- [ ] Provider-Erkennung erfolgt serverseitig aus der Supabase-Session (kein Client-Side-Guess)

### Sektion: Account löschen
- [ ] Trigger-Button mit Label "Account löschen" (dunkle Farbe, visuell von anderen Buttons unterschieden). Der ausführliche Disclaimer „unwiderruflich" steht im umgebenden Sektions-Text, nicht im Button-Label.
- [ ] Klick öffnet shadcn/ui `AlertDialog` (gleicher Pattern wie Projekt-/Kapitel-Löschen in der App)
- [ ] Dialog fordert Texteingabe zur Bestätigung (z. B. "LÖSCHEN" eintippen); Löschen-Button ist disabled bis korrekte Eingabe
- [ ] **Löschen ist immer möglich:** Keine Rolle und kein Projekt blockiert die Kontolöschung.
- [ ] **Ein Konto löscht nie ein Projekt, in dem andere mitwirken.** Das gilt auch, wenn die Person Eigentümer oder Käufer ist, das Projekt verlassen hat oder daraus entfernt wurde.
- [ ] **Projekte nur mit dieser Person:** werden im Dialog aufgelistet und mit Kapiteln, Cover, Logo und Bildern im Speicher gelöscht.
- [ ] **Gemeinsame Projekte:** werden im Dialog aufgelistet und bleiben mit allen Kapiteln bestehen, auch mit den von dieser Person geschriebenen. War sie Eigentümer, geht das Eigentum an eine verbleibende Projektleitung über.
- [ ] **Einzige Projektleitung mit Co-Autoren:** Der Dialog zeigt pro Projekt eine Nachfolge-Auswahl, die am längsten beteiligte Person ist vorausgewählt. Sie wird sofort Projektleitung und per Mail informiert. Dieselbe Auswahl gilt beim Verlassen eines Projekts.
- [ ] **Noch nicht angenommenes Geschenk:** Löscht ein Käufer ohne eigenen Zugang sein Konto, bleiben Projekt und Einladung gültig. Beim Annehmen wird die beschenkte Person Eigentümer.
- [ ] **Wird entfernt:** Profil, Name, E-Mail, Anmeldung, Mitgliedschaften, noch nicht versendete Mails an die Person und ihre Angaben in bereits eingelösten Käufen (`purchase_claims`). Offene, bezahlte Käufe bleiben bestehen, damit sie nicht verloren gehen. Die Zuordnung „wer hat dieses Kapitel geschrieben" entfällt.
- [ ] **Bleibt erhalten:** `payments` und Rechnungen wegen der Aufbewahrungspflicht, ohne Verbindung zum gelöschten Konto.
- [ ] **Mitschreibende je Kapitel:** Künftig wird gespeichert, wer an einem Kapitel geschrieben hat, damit der Support Anfragen prüfen kann. Mitglieder können diese Angabe weder sehen noch ändern.
- [ ] **Sichere Prüfung:** Dialog und Löschung nutzen denselben serverseitigen Stand aus Mitgliedschaft und Eigentum. Schlägt eine Prüfung fehl, wird nichts gelöscht und eine Fehlermeldung gezeigt. Es bleibt kein halb gelöschtes Konto zurück.
- [ ] Bei erfolgreicher Löschung: Supabase-Account wird gelöscht, Session wird beendet, Nutzer wird zu `/anmelden` weitergeleitet
- [ ] **Texte:** Sektion und Dialog nennen weder Export noch Kopie. Der Satz „Exportieren Sie vorher ggf. wichtige Texte oder Bilder" entfällt. Der Dialog lautet:

  > **Account wirklich löschen?**
  > Das Löschen kann nicht rückgängig gemacht werden. Rechnungen müssen wir aus steuerlichen Gründen acht Jahre aufbewahren.
  >
  > **Wird gelöscht**
  > - Ihr Account: [Name] ([E-Mail])
  > - Projekt „[Titel]" (je Projekt, in dem nur Sie mitwirken)
  >
  > **Bleibt bestehen**
  > - Projekt „[Titel]" (je gemeinsames Projekt)
  >
  > Möchten Sie eigene Texte entfernen lassen, schreiben Sie uns bitte vor der Löschung an kontakt@narravit.de.
  >
  > **Nachfolge** (nur für die einzige Projektleitung eines Projekts mit weiteren Mitgliedern, nie für Co-Autoren): Wer soll „[Titel]" weiterführen? [Auswahl]
  >
  > Tippen Sie **LÖSCHEN** zur Bestätigung.

### Sonderfälle über den Support
- [ ] Eigene Texte aus einem gemeinsamen Projekt entfernen, eine Kopie der eigenen Inhalte und Streitfälle werden auf Anfrage geklärt, nicht über eigene Funktionen in der App.
- [ ] Antwort innerhalb eines Monats, Entscheidung und Begründung werden dokumentiert. Bei einer Ablehnung wird auf das Beschwerderecht hingewiesen.
- [ ] Eine Kopie umfasst die eigenen Texte und selbst hochgeladenen Bilder in einem gängigen Format, die erste ist kostenlos. Druckfertige Dateien, Satz, Layout, Cover und Kapitel anderer gehören nicht dazu.

## Edge Cases
- Nutzer klickt mehrfach auf "Name speichern" → idempotent; doppelte Supabase-Requests werden durch Button-Disabled-State während des Requests verhindert
- Nutzer löscht Account und hat offene Projekt-Einladungen (als Empfänger) → Normale Einladungen an diese Adresse werden entfernt, das Projekt bleibt unberührt. Eine offene Geschenk-Einladung bleibt bis zu ihrem Ablauf gültig, sonst wäre das bezahlte Geschenk für niemanden mehr erreichbar (PROJ-9 behandelt den vollständigen Einladungsflow)
- Projekt nur mit dieser Person, aber mit offener normaler Einladung → Projekt wird mitgelöscht, die Einladung wird ungültig; der Dialog nennt das Projekt unter „Wird gelöscht"
- Zwei Projektleitungen löschen gleichzeitig ihr Konto → der Server prüft jede Löschung einzeln; die zweite Person muss eine Nachfolge wählen, falls sie nun die einzige Projektleitung ist
- Die gewählte Nachfolge löscht gleichzeitig ihr Konto oder verlässt das Projekt → Löschung bricht ab, der Dialog zeigt die aktuelle Auswahl neu
- Erzählende Person ohne Konto (PROJ-12): Hat sie in einem Projekt nur mit dem Käufer bereits erzählt, muss der Dialog darauf hinweisen. Regel beim Bau von PROJ-12 festlegen.
- OAuth-Nutzer versucht auf den Sicherheits-Abschnitt zu tippen → Hinweis-Text ist nicht interaktiv, kein Button vorhanden; keine Aktion möglich
- Portal-Zugang läuft ab, während der Nutzer die Seite geöffnet hat → nächster Seitenaufruf / Route-Wechsel triggert Middleware-Redirect zu `/zugang-abgelaufen`; kein sofortiger Kick auf der aktuellen Seite nötig
- Nutzer hat mehrere Browser-Tabs offen und löscht Account in einem Tab → andere Tabs zeigen beim nächsten API-Call einen Auth-Fehler und leiten zu `/anmelden` weiter

## Refine 2026-11-22: Konto-Löschen

**Anlass:** Die Prüfung von Code und Stage-Schema hat gezeigt, dass eine Kontolöschung ganze Projekte anderer vernichten kann. `projects.owner_id` steht auf `ON DELETE CASCADE`, die bisherige Prüfung zählt aber nur Mitglieder mit der Rolle Projektleiter. Betroffen sind Eigentümer mit zweiter Projektleitung, Eigentümer, die das Projekt verlassen haben oder entfernt wurden, und angemeldete Käufer eines Geschenks ohne eigenen Zugang. Der Trigger zum letzten Projektleiter schützt nicht, weil zuerst das Projekt gelöscht wird.

**Entscheidungen von Jakob:**
- Das Löschen des Kontos muss immer möglich sein.
- Die Kontolöschung löscht das Konto, aber nicht die Kapitel in gemeinsamen Projekten.
- Sonderfälle und Sonderwünsche werden auf Anfrage über den Support geklärt und nicht alle in Dialoge und Funktionen eingebaut.
- Gelöschte Kapitel und Projekte mit mehreren Mitgliedern kommen in einen 14-Tage-Papierkorb (eigene Spec PROJ-26).
- Mitschreibende stimmen beim Beitritt den AGB zu (eigene Spec PROJ-27). Die AGB unterscheiden nach Rollen.
- Der Dialog erwähnt keine Kopie, und die App bietet keinen standardisierten Export an.

**Rechtliche Einordnung (Recherche, keine Rechtsberatung, vor dem Go-live anwaltlich prüfen):**
- Art. 17 DSGVO betrifft die Daten der löschenden Person, nicht automatisch die Texte anderer.
- Die bloße Möglichkeit, ein Kapitel zu lesen oder zu bearbeiten, macht es nicht zum gemeinsamen Werk. Das Urheberrecht bleibt bei der schreibenden Person (§§ 7, 8, 29 UrhG). Dass ihre Texte im Buch bleiben dürfen, stützt sich deshalb auf ein einfaches, auf dieses Buch begrenztes Nutzungsrecht in den AGB (§ 31 UrhG).
- Die eigenen Texte sind in der Regel auch personenbezogene Daten. Löschung und Kopie auf Anfrage (Art. 15, 17, 20 DSGVO) lassen sich nicht per AGB ausschließen, auch nicht wegen des Motivs, das Buch anderswo zu drucken.
- Keine Pflicht besteht für einen Export-Button, einen Hinweis im Lösch-Dialog oder druckfertige Dateien. Die Datenschutzerklärung muss die Rechte aber nennen (Art. 13 DSGVO).

## Technical Requirements
- Sicherheit: Name- und E-Mail-Updates ausschließlich über Server Actions / API Routes — kein direkter Client-Write auf `profiles`
- Sicherheit: OAuth-Provider-Erkennung serverseitig; kein Vertrauen auf Client-State
- Sicherheit: Account-Löschung prüft serverseitig Mitgliedschaft und Eigentum und bricht bei jedem Prüffehler ab
- Änderungen an RLS, Foreign Keys und am Auth-Ablauf brauchen Jakobs ausdrückliche Freigabe; Migrationen spielt Jakob selbst ein
- Stripe: Rechnungsliste und Download-Links kommen direkt aus der Stripe API (server-seitig) — nicht aus der `payments`-Tabelle; PROJ-6 baut den Stripe-Client
- UX: Alle destruktiven Aktionen (Löschen) nur über AlertDialog mit Bestätigung
- UX: Toast-Feedback nach Name-Save und nach Passwort-Reset-Trigger (shadcn/ui `Sonner`)

---

## Nachtrag 2026-10-14 — Passwort für Google-/Facebook-Konten

- Abschnitt „Sicherheit" zeigt den Button jetzt auch für Konten, die per Google oder Facebook angelegt wurden (früher nur Hinweis „Passwort-Verwaltung erfolgt dort").
- Drei Zustände:
  - E-Mail-Konto: unverändert „Passwort zurücksetzen".
  - Google-/Facebook-Konto ohne Passwort: „Sie melden sich über Google an. Wenn Sie sich zusätzlich mit einer E-Mail-Adresse und einem Passwort anmelden möchten, können Sie hier ein Passwort festlegen." — Button „Passwort festlegen".
  - Google-/Facebook-Konto mit Passwort: Hinweis, dass zusätzlich ein Passwort festgelegt ist — Button „Passwort ändern".
- Ob ein Passwort existiert, liefert Supabase nicht mit dem Nutzer-Objekt. Das Reset-Formular setzt deshalb beim Speichern den Marker `has_password` in den Nutzer-Metadaten; ausgewertet wird er in `src/lib/auth/has-password.ts` (mit Unit-Test). Der Marker steuert nur die Beschriftung, keine Berechtigung.
- Bewusst **ohne** Datenbank-Änderung: Eine Hilfsfunktion in der Datenbank wäre genauer gewesen, die Supabase-Anbindung durfte am 2026-10-14 aber keine Migration anwenden („You do not have permission").
- Nicht im Browser mit einem Google-Konto geprüft (QA-Konto ist ein E-Mail-Konto); Typprüfung, Unit-Tests und der E2E-Test für E-Mail-Konten (AC-13) sind grün.

## Technische Entscheidungen
_Kurzform. Die vollständige Begründung steht im Archiv._

### D) Entscheidungen

| Entscheidung | Warum |
|---|---|
| Projekt löst sich vom Konto | Das behebt die Ursache. Das Eigentümer-Feld wird sonst nirgends für Rechte genutzt, die Änderung ist also risikoarm |
| Sperre für die letzte Projektleitung bleibt | Weil das Projekt nun bestehen bleibt, greift sie künftig wirklich. Fehlt die Nachfolge, bricht die Löschung ab, statt Inhalte zu verlieren |
| Nachfolge gilt sofort, ohne Annahme | Müsste jemand erst zustimmen, könnte eine Person ihr Konto nicht zuverlässig löschen |
| Mitschreibende in eigener Tabelle | Mitglieder dürfen Kapitel ändern und könnten eine Angabe im Kapitel selbst fälschen (Lehre aus PROJ-1 BUG-2) |
| Erfasst wird, wer schreibt, nicht wer anlegt | Oft legt eine Person das Kapitel an und eine andere schreibt es. Für Support-Anfragen zählt, wer den Text verfasst hat |
| Verschenkte Bücher nur als allgemeiner Hinweis | Der Käufer ohne eigenen Zugang darf den Titel der beschenkten Person nicht sehen |
| Offene Geschenk-Einladung bleibt gültig | Sonst wäre ein bezahltes Geschenk für niemanden mehr erreichbar |
| Offene Käufe bleiben, eingelöste werden bereinigt | Ein bezahlter, noch nicht eingelöster Kauf ginge sonst verloren |
| Dateien über eine Aufräum-Liste | Der Speicher gehört nicht zur Datenbank-Transaktion. So geht keine Datei verloren, die eigentlich gelöscht werden muss. PROJ-26 nutzt denselben Baustein |
| Bestehende RLS-Regeln bleiben unverändert | Der Löschablauf läuft nur auf dem Server. Die neuen Tabellen sind für Browser-Zugriffe komplett gesperrt |

### Spätere Entscheidungen
- **„Mein Zugang“** ist aus dem persönlichen Bereich entfernt. Das Ablaufdatum steht in der Projektübersicht.
- **E-Mail-Änderung** läuft über den Support, bis ein sauberer Ablauf steht (zu viele Sonderfälle bei Bestätigung und OAuth). Kein Self-Service.
- **Apple-Anmeldung** bleibt deaktiviert, bis die Developer-Konfiguration steht. Google und Facebook sind aktiv.
- **„Mitglied seit“** wird nicht gebaut. Das Kaufdatum steht auf den Stripe-Rechnungen.

## Offene Punkte
- Regel für eine erzählende Person ohne Konto beim Konto-Löschen folgt mit PROJ-12.
- Entscheidung Jakob (2026-11-23, BUG-6): Vor dem Löschen gibt es keine erneute Identitätsprüfung. Es bleibt bei der Eingabe von `LÖSCHEN`, das Risiko ist bewusst akzeptiert.
- Nicht geprüft: Zustellung der Nachfolge-Mail, Firefox und Safari, zwei wirklich zeitgleiche `deleteUser`-Aufrufe.
