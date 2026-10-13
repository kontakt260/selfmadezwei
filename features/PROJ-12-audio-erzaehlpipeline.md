# PROJ-12: Audio-Erzählpipeline (Sprachnachrichten)

## Status: Architected
**Created:** 2026-05-25
**Last Updated:** 2026-10-13

> **Neufassung 2026-10-13.** Ersetzt die frühere „Vapi-Pipeline" (Telefon-Assistent) vollständig. Die alte Spec liegt nur noch zur Referenz unter [archive/PROJ-12-vapi-pipeline.md](archive/PROJ-12-vapi-pipeline.md) und wird **nicht** umgesetzt. Das frühere Tech-Design ist damit hinfällig — `/architecture` muss neu laufen.

## Kurzbeschreibung
Die erzählende Person bekommt automatisch einmal pro Woche per Mail und/oder SMS eine Erzähl-Aufforderung zu einem Kapitel. Über einen persönlichen, nicht erratbaren Link öffnet sie eine Aufnahmeseite im Browser (ohne Login) und erzählt ihre Geschichte als Monolog. NARRAVIT verschriftlicht die Aufnahme und formuliert daraus intern einen flüssigen Kapiteltext in Ich-Form, der im Kapitel landet und im Editor weiterbearbeitet werden kann. Zusätzlich kann im Portal jederzeit direkt zu einem noch leeren Kapitel erzählt werden.

## Dependencies
- Requires **PROJ-1** (Datenmodell & RLS) — neue Tabellen für Erzähl-Kontakt, Aufforderungen und Aufnahmen; privater Audio-Speicher
- Requires **PROJ-2 / PROJ-3** (Auth, Onboarding) — Onboarding-Wizard wird umgebaut (siehe unten)
- Requires **PROJ-4** (Kapitel-Routing & Persistenz) — Kapitel-Anlage und Body-Update
- Requires **PROJ-5** (Kapitel-Editor) — Editor zeigt und bearbeitet den erzeugten Text
- Requires **PROJ-6** (Stripe-Zahlungen) — nur noch: aktiver Portal-Zugang als Voraussetzung. **Kein Kontingent, kein Nachkauf** (Rückbau siehe PROJ-6)
- Requires **PROJ-8** (Erzähl-Impulse) — Impuls-Titel und Leitfragen sind der Inhalt der Aufforderungen
- Requires **PROJ-9** (Mitglieder) — Berechtigungs-Muster „nur Projektleiter ändert, Co-Autor liest"
- Requires **PROJ-11** (Resend) — Mail-Versand, `mail_log`-Idempotenz, Cron-Muster
- Soft: **PROJ-14** (LLM-Abstraktion) — PROJ-12 braucht bereits eine minimale serverseitige Provider-Abstraktion für Transkription + Ausformulierung; PROJ-14 baut darauf auf
- Requires vor Live-Gang: **PROJ-17** (Rate-Limiting) — die öffentliche Aufnahmeseite darf nicht ohne Rate-Limits live gehen
- Soft: **PROJ-19** (Hardening) — `Permissions-Policy` muss das Mikrofon für die Aufnahme-Routen erlauben

## Begriffe
- **Erzählende Person:** genau eine pro Projekt; die Person, deren Geschichte erzählt wird. Zum Erzählen braucht sie **kein Konto**. Im Pfad „Auch am Computer schreiben" ist sie zusätzlich mit Konto als Projektmitglied hinterlegt; bei „Für mich selbst" ist sie der Käufer. Die Aufnahme-Links funktionieren in allen Fällen ohne Login.
- **Erzähl-Aufforderung:** eine Nachricht (Mail und/oder SMS) zu genau einem Kapitel, mit persönlichem Aufnahme-Link.
- **Aufnahme:** eine eingereichte Audiodatei inkl. Verarbeitungsstatus, Roh-Transkript und erzeugtem Text.
- **Leeres Kapitel:** Kapitel, dessen Text keinen sichtbaren Inhalt hat (kein Text, keine Bilder) und zu dem keine Aufnahme in Verarbeitung ist.

## User Stories
- Als **erzählende Person** möchte ich eine einfache Nachricht mit einem Thema und ein paar Leitfragen bekommen und mit einem Fingertipp erzählen können — ohne Konto, ohne Passwort, ohne App.
- Als **erzählende Person** möchte ich nach dem Abschicken klar sehen, dass meine Geschichte angekommen ist.
- Als **Geschenkkäufer** möchte ich im Onboarding festlegen, wie wir die beschenkte Person erreichen (E-Mail und/oder SMS), damit sie ohne weiteres Zutun wöchentlich zum Erzählen eingeladen wird.
- Als **Projektleiter** möchte ich Kontaktdaten, Kanal und Wochentag später ändern können.
- Als **Projektmitglied** möchte ich im Portal jederzeit selbst zu einem leeren Kapitel erzählen können, statt zu tippen.
- Als **Projektmitglied** möchte ich sehen, welche Kapitel per Sprachnachricht entstanden sind, die Original-Aufnahme anhören und den Text im Editor überarbeiten können.
- Als **erzählende Person** möchte ich sicher sein, dass niemand Fremdes meinen Link erraten, meine Geschichten lesen oder in meinem Namen etwas einreichen kann.

## Acceptance Criteria

### Onboarding-Umbau
Neuer Ablauf (Schritte in Klammern nur bedingt):

| # | Schritt | Wann |
|---|---|---|
| 1 | Für wen ist das Lebensbuch? | immer (außer vorbelegt) |
| 2 | Dein Name | immer |
| 3 | Für wen ist das Geschenk? — Name + Erzählweise | nur Geschenk |
| 4 | **NEU:** Wie erreichen wir [Name]? | Geschenk (beide Erzählweisen); „Für mich selbst" (abwählbar) |
| 5 | Zugang einrichten | nur Geschenk + „Auch am Computer schreiben" |
| 6 | Bereit zum Start? | immer |

- [ ] Die Logik des Geschenk-Pfads bleibt wie bisher: **Erzählen ist die Basis, der Computer die Ergänzung.** Nur die Bezeichnung ändert sich.
- [ ] Schritt 3: Die Auswahl heißt **„Nur per Sprachnachricht erzählen"** vs. **„Auch am Computer schreiben"** (ersetzt „Nur per Telefon erzählen" / „Auch am Computer schreiben"). Beschreibungstexte: „Die beschenkte Person bekommt jede Woche eine Erzähl-Aufforderung und erzählt per Sprachnachricht — wir machen daraus den Text." / „Die beschenkte Person kann zusätzlich selbst im Portal schreiben."
- [ ] Schritt 4 (neu, in **beiden** Geschenk-Pfaden) fragt ab: E-Mail **und/oder** Handynummer der erzählenden Person (mindestens eines Pflicht), daraus ergibt sich der Kanal (Mail, SMS oder beides); dazu der **Wochentag** der Aufforderung (Vorauswahl Sonntag).
- [ ] Handynummer wird im internationalen Format gespeichert; Vorauswahl +49; ungültige Nummern werden inline abgelehnt.
- [ ] Schritt 4 enthält einen kurzen Hinweis, dass die Person regelmäßig Nachrichten von narravit bekommt; der Käufer bestätigt, dass die Person einverstanden ist.
- [ ] **Pfad „Nur per Sprachnachricht erzählen":** kein Schritt 5, keine Portal-Einladung; die beschenkte Person hat kein Konto und erzählt nur über die Links. Der Käufer ist Projektleiter ohne Opt-out (wie im früheren „Nur Telefon"-Pfad, inkl. Hinweistext).
- [ ] **Pfad „Auch am Computer schreiben":** Schritt 5 wie bisher (E-Mail für die Portal-Einladung Pflicht — vorbefüllt aus Schritt 4, falls dort angegeben —, eigener Zugang, Rolle). Die Aufforderungen aus Schritt 4 laufen zusätzlich.
- [ ] **„Für mich selbst":** Schritt 4 erscheint mit der eigenen E-Mail vorbefüllt und der Option „Ich möchte nur selbst schreiben" (dann keine Aufforderungen).
- [ ] Schritt 6: Zusammenfassung zeigt Erzählweise, Kanal und Wochentag. Der Preistext lautet ohne Vapi/Kontingent, z. B. „Inklusive Erzählen per Sprachnachricht, Editor und Druck-Vorbereitung."
- [ ] Die Angaben werden wie die bisherigen Onboarding-Daten über den Checkout mitgegeben und beim Anlegen des Projekts (Stripe-Webhook) gespeichert.

### Einstellungen in der Projektübersicht
- [ ] Die Platzhalter-Sektion „Code für das Telefonieren" wird ersetzt durch **„Erzählen per Sprachnachricht"**.
- [ ] Sie zeigt: Name der erzählenden Person, Kontaktwege (teilmaskiert für Co-Autoren), Wochentag, Status (aktiv / nicht eingerichtet), Datum der nächsten Aufforderung.
- [ ] **Projektleiter** kann Kontaktdaten, Kanal und Wochentag ändern. Co-Autoren sehen die Sektion nur lesend. Es gibt **keine** Pausieren-Funktion.
- [ ] Ist nichts eingerichtet (z. B. „Für mich selbst" mit „Ich möchte nur selbst schreiben"), zeigt die Sektion „Noch nicht eingerichtet" + Button „Einrichten" (nur Projektleiter).
- [ ] Ändert der Projektleiter einen Kontaktweg, werden alle noch offenen Links sofort ungültig.
- [ ] Es gibt **keinen** Button zum manuellen Versenden einer Aufforderung.
- [ ] Die Stat-Karte „Telefonzeit übrig" entfällt (Rückbau in PROJ-6).

### Automatischer Versand
- [ ] Einmal pro Woche am gewählten Wochentag (vormittags, deutsche Zeit) wird pro Projekt **eine** Aufforderung verschickt — sofern der Portal-Zugang aktiv ist und ein Kontaktweg hinterlegt ist.
- [ ] Thema ist das **nächste leere Kapitel in Buch-Reihenfolge**, zu dem noch keine Aufforderung offen ist.
- [ ] Gibt es kein leeres Kapitel, wird der nächste noch nicht verwendete Erzähl-Impuls aus dem Katalog als neues Kapitel am Ende angelegt und dazu aufgefordert.
- [ ] Sind alle Impulse verwendet und kein Kapitel leer, endet der Versand; der Projektleiter wird einmalig per Mail informiert.
- [ ] Die **erste** Aufforderung geht am ersten gewählten Wochentag nach dem Kauf raus (frühestens am Folgetag), mit einer kurzen Einleitung, wer das Buch geschenkt hat und wie das Erzählen funktioniert.
- [ ] Bleibt ein Kapitel unerzählt, kommt **3 Tage später genau eine Erinnerung** mit demselben Link. Die Woche darauf folgt trotzdem das nächste Kapitel.
- [ ] Inhalt der Nachricht: Anrede mit Vornamen, Kapitel-Titel, bei Mail zusätzlich die Leitfragen des Impulses, der Aufnahme-Link. SMS ist kurz (Thema + Link).
- [ ] Jede Aufforderung wird pro Projekt, Kapitel und Art (Erst-Nachricht / Erinnerung) genau einmal verschickt, auch wenn der Versand-Job doppelt läuft.
- [ ] Versandfehler (unzustellbare Nummer/Adresse) werden protokolliert; nach wiederholtem Fehlschlag sieht der Projektleiter in der Sektion einen Hinweis „Nachrichten konnten nicht zugestellt werden".
- [ ] Es gibt **keine** Abmelde-Funktion für die erzählende Person und kein Pausieren (bewusste Entscheidung 2026-10-13). Der Versand endet, wenn alle Kapitel erzählt sind, der Portal-Zugang abläuft oder der Projektleiter die Kontaktwege entfernt. Wurde ein Kapitel von Hand befüllt, wird die dazugehörige **Erinnerung nicht mehr verschickt**.

### Sicherheit des Aufnahme-Links (ohne Login)
- [ ] Jeder Link enthält ein **zufälliges Geheimnis mit mindestens 256 Bit** aus einem kryptografisch sicheren Zufallsgenerator. Es wird **nicht** aus Projekt-ID, Kapitel-ID, Telefonnummer, Zeitstempel oder fortlaufenden Nummern abgeleitet und enthält keine davon.
- [ ] In der Datenbank liegt **nur ein Hash** des Geheimnisses. Auch mit Lesezugriff auf die Datenbank oder Logs lässt sich kein gültiger Link rekonstruieren.
- [ ] Ein Link gilt für **genau ein Kapitel** eines Projekts und erlaubt **ausschließlich**: Thema und Leitfragen sehen, aufnehmen, einreichen. Er gibt **keinen** Lesezugriff auf Kapiteltexte, andere Kapitel, frühere Aufnahmen, Mitglieder oder Kontaktdaten.
- [ ] Die Aufnahmeseite zeigt an Personendaten höchstens den Vornamen der erzählenden Person und den Kapitel-Titel.
- [ ] Ein Link kann nicht mehr zum Einreichen genutzt werden, sobald: eine Aufnahme darüber eingereicht wurde, das Kapitel nicht mehr leer ist, 30 Tage vergangen sind, der Kontaktweg geändert wurde, der Portal-Zugang abgelaufen ist oder das Projekt/Kapitel gelöscht wurde.
- [ ] Unbekannte, abgelaufene und widerrufene Links zeigen **dieselbe** neutrale Seite („Dieser Link ist nicht mehr gültig") — keine Unterscheidung, die Rückschlüsse zulässt. Einzige Ausnahmen sind die beiden freundlichen Hinweise unten („bereits geschrieben" / „bereits erzählt"); sie erscheinen nur bei einem echten, noch nicht abgelaufenen Link und verraten keine Inhalte.
- [ ] **Kapitel inzwischen von Hand befüllt:** Öffnet die Person einen Link zu einem Kapitel, das zwischenzeitlich im Portal geschrieben wurde, sieht sie statt des Aufnahme-Knopfs einen klaren Hinweis, z. B. „Zu diesem Thema ist schon etwas geschrieben worden — hier musst du nichts mehr erzählen. Dein nächstes Thema kommt am [Wochentag]." Eine Aufnahme ist nicht möglich, damit nicht doppelt erzählt wird. Mit der nächsten regulären Aufforderung geht es mit dem nächsten leeren Kapitel weiter.
- [ ] **Bereits über diesen Link erzählt:** Hinweis „Danke — deine Geschichte zu diesem Thema ist schon angekommen."
- [ ] Die Prüfung „Kapitel noch leer?" erfolgt auch **beim Absenden** erneut: Wurde das Kapitel während der Aufnahme von Hand befüllt, wird die Aufnahme trotzdem angenommen (nichts geht verloren), aber nicht ins Kapitel geschrieben (siehe Verarbeitung).
- [ ] Aufrufe und Uploads sind pro IP und pro Link begrenzt (Rate-Limit); auffällige Fehlversuchs-Muster werden gemeldet.
- [ ] Das Geheimnis taucht nicht in Server-Logs, Fehler-Tracking oder Analyse-Tools auf; die Aufnahmeseite sendet es nicht an Dritte (kein Referrer, keine externen Skripte, nicht in Suchmaschinen indexierbar).
- [ ] Links werden in voller Länge verschickt — **kein** externer Link-Kürzer, auch nicht in SMS.
- [ ] Der Upload läuft über den Server bzw. eine kurzlebige, auf genau diese Aufnahme beschränkte Upload-Freigabe; der Audio-Speicher ist privat und nie öffentlich abrufbar.
- [ ] Alle Prüfungen (Link gültig, Kapitel leer, Zugang aktiv) erfolgen serverseitig bei **jedem** Schritt — Seitenaufruf, Upload-Start, Einreichen.

### Aufnahmeseite (per Link, ohne Login)
- [ ] Funktioniert in aktuellen Browsern auf Smartphone, Tablet und Desktop. (Die Phone-Sperre betrifft nur den Kapitel-Editor, nicht das Erzählen.)
- [ ] Sehr einfache Oberfläche: Begrüßung, Thema, Leitfragen, ein großer Aufnahme-Knopf. Große Schrift, hohe Kontraste, wenige Elemente.
- [ ] Vor der ersten Aufnahme wird erklärt, dass der Browser um Mikrofon-Erlaubnis bittet. Bei verweigerter Erlaubnis erscheint eine verständliche Anleitung statt einer Fehlermeldung.
- [ ] Während der Aufnahme: laufende Zeit, sichtbares Signal „Aufnahme läuft", **Pausieren/Fortsetzen**, Beenden.
- [ ] Nach dem Beenden: Anhören, **Neu aufnehmen** oder **Absenden**. Erst „Absenden" reicht ein.
- [ ] Upload mit Fortschrittsanzeige; bei Verbindungsabbruch bleibt die Aufnahme auf dem Gerät erhalten und kann erneut gesendet werden, solange die Seite offen ist.
- [ ] Maximale Länge pro Aufnahme: **60 Minuten** (technische Grenze, kein Kontingent). Ab 55 Minuten Hinweis; bei 60 Minuten stoppt die Aufnahme und kann abgesendet werden.
- [ ] Nach dem Absenden: klare Bestätigung („Danke, [Vorname] — deine Geschichte ist angekommen."). Der Link ist danach verbraucht.
- [ ] Unterstützt der Browser keine Aufnahme, erscheint ein Hinweis mit der Bitte, den Link in einem aktuellen Browser zu öffnen.

### Erzählen im Portal (eingeloggt)
- [ ] Bei jedem **leeren** Kapitel gibt es in der Projektübersicht und im leeren Editor die Aktion **„Per Sprachnachricht erzählen"**. Bei nicht leeren Kapiteln wird sie nicht angeboten.
- [ ] Verfügbar für Projektleiter und Co-Autoren mit aktivem Portal-Zugang; auch auf dem Phone.
- [ ] Gleiche Aufnahme-Oberfläche und gleiche Grenzen wie auf der Link-Seite; Berechtigung über die normale Anmeldung und Projektmitgliedschaft.
- [ ] Wird im Portal zu einem Kapitel erzählt, werden offene Links zu diesem Kapitel ungültig.

### Verarbeitung
- [ ] Nach dem Einreichen läuft die Verarbeitung im Hintergrund: **Audio → Transkript → ausformulierter Kapiteltext**. Der Nutzer muss nicht warten.
- [ ] Der erzeugte Text ist in **Ich-Form**, flüssig lesbar, **nah am Wortlaut**: Füllwörter, Versprecher und Wiederholungen werden geglättet, Absätze gesetzt. Es wird **nichts gekürzt, nichts hinzuerfunden**, Namen/Orte/Daten bleiben wie gesagt.
- [ ] Kapitel-Titel bleibt der bestehende Titel (einzige Überschriftenquelle); der Text enthält keine eigene Überschrift.
- [ ] Der Text wird in das Kapitel geschrieben, wenn es zu diesem Zeitpunkt **noch leer** ist. Das Kapitel ist danach als „Per Sprachnachricht erzählt" gekennzeichnet.
- [ ] **Von Hand Geschriebenes ist immer der Master-Text.** Audio überschreibt oder ergänzt niemals vorhandenen Kapitelinhalt. Wurde das Kapitel in der Zwischenzeit von Hand befüllt, wird **nichts überschrieben**: Der Text bleibt an der Aufnahme gespeichert und kann von Mitgliedern in der Kapitel-Ansicht eingesehen und manuell übernommen werden.
- [ ] Original-Audio, Roh-Transkript und erzeugter Text bleiben gespeichert und sind für Projektmitglieder abrufbar (Audio anhören, Transkript ansehen).
- [ ] Während der Verarbeitung zeigt das Kapitel in der Übersicht den Status „Erzählung wird verarbeitet"; es gilt in dieser Zeit nicht als leer.
- [ ] Schlägt ein Schritt fehl, wird automatisch mehrfach wiederholt. Bleibt es beim Fehler: Audio bleibt erhalten, Status „Verarbeitung fehlgeschlagen" ist für Mitglieder sichtbar, das narravit-Team wird alarmiert und kann neu anstoßen. **Eine eingereichte Aufnahme geht nie verloren.**
- [ ] Doppeltes Einreichen derselben Aufnahme (Doppelklick, Retry) erzeugt nur eine Aufnahme und einen Text.
- [ ] Ist das fertig: Projektleiter (und Co-Autoren) bekommen eine Mail „[Name] hat ein neues Kapitel erzählt" mit Link zum Kapitel.
- [ ] Transkription und Ausformulierung laufen ausschließlich serverseitig über eine Provider-Abstraktion; keine Schlüssel im Client.

### Kennzeichnung
- [ ] Kapitel aus Aufnahmen tragen in der Projektübersicht das Kennzeichen „Per Sprachnachricht erzählt" (analog „Eigenes Kapitel" / „Erzähl-Impuls").
- [ ] Im Kapitel ist sichtbar, wann erzählt wurde, mit Zugriff auf Aufnahme und Transkript.

## Edge Cases
- **Link wird weitergeleitet** (z. B. an Enkel): Wer den Link hat, kann einmal zu diesem Kapitel einreichen, aber nichts lesen. Bewusst akzeptiert; der Schaden ist auf eine Aufnahme begrenzt, die Mitglieder vor dem Druck sehen.
- **Zwei offene Links** (Vorwoche + aktuelle Woche): beide gültig, je für ihr eigenes Kapitel.
- **Link der Erinnerung = Link der Erst-Nachricht**: Einreichen über einen macht beide ungültig.
- **Kapitel wird gelöscht**, während ein Link offen ist: Link ungültig, neutrale Seite.
- **Kapitel wird von Hand befüllt und wieder geleert**, bevor der Link abläuft: Link ist wieder nutzbar (maßgeblich ist der Zustand beim Öffnen und beim Absenden).
- **Kapitel-Reihenfolge wird geändert:** betrifft nur künftige Aufforderungen.
- **Portal-Zugang läuft ab:** kein Versand, offene Links ungültig, Portal-Aufnahme gesperrt. Nach Verlängerung läuft der Versand am nächsten Wochentag weiter.
- **Sehr kurze oder stille Aufnahme** (unter ca. 10 Sekunden oder ohne erkennbare Sprache): kein Kapiteltext; Kapitel bleibt leer, Aufnahme wird als „nicht verwertbar" markiert, die Person kann über die nächste Erinnerung/Aufforderung erneut erzählen.
- **Aufnahme in anderer Sprache / Dialekt:** Text wird bestmöglich auf Hochdeutsch ausformuliert; Roh-Transkript bleibt zur Kontrolle.
- **Person erzählt zu einem anderen Thema** als angefragt: Text landet trotzdem im angefragten Kapitel; Mitglieder können Titel und Text anpassen.
- **Seite wird während der Aufnahme geschlossen:** Aufnahme ist verloren; beim Verlassen erscheint eine Browser-Warnung.
- **Sehr große Datei / schlechtes Netz:** Upload in Teilen mit Wiederaufnahme, solange die Seite offen ist.
- **Kontaktweg geändert zwischen Erst-Nachricht und Erinnerung:** alte Links ungültig, keine Erinnerung; nächste reguläre Aufforderung geht an den neuen Kontakt.
- **Dieselbe Handynummer/E-Mail in mehreren Projekten:** erlaubt; jede Nachricht nennt das Projekt bzw. den Schenkenden.
- **„Für mich selbst" mit Aufforderungen:** Käufer ist zugleich erzählende Person; Link funktioniert genauso ohne Login.
- **Projekt wird gelöscht / Konto gelöscht:** Aufnahmen, Transkripte und Kontaktdaten des Projekts werden mitgelöscht.

## Technical Requirements
- **Sicherheit:** Anforderungen aus „Sicherheit des Aufnahme-Links" sind verbindlich und Teil des QA-Security-Audits. Öffentliche Routen bekommen eigene Rate-Limits.
- **Datenschutz:** Audio und Transkripte sind besonders schützenswerte persönliche Inhalte. Speicherung in der EU; Transkriptions-, LLM- und SMS-Anbieter nur mit Auftragsverarbeitungsvertrag und ohne Nutzung der Inhalte zu Trainingszwecken. Kontaktdaten der erzählenden Person liegen getrennt von frei bearbeitbaren Projektdaten und sind nur für Projektleiter änderbar.
- **Einwilligung:** Der Käufer bestätigt im Onboarding das Einverständnis der erzählenden Person. Keine Abmelde-Funktion (bewusste Produktentscheidung); SMS mit Absenderkennung „narravit". In `/architecture` ist zu prüfen, ob der gewählte SMS-Anbieter bzw. das Recht (DSGVO/UWG) eine Opt-out-Möglichkeit technisch oder rechtlich erzwingt.
- **Browser-Rechte:** Mikrofon-Freigabe nur auf den Aufnahme-Routen (Anpassung der `Permissions-Policy` aus PROJ-19).
- **Zuverlässigkeit:** Verarbeitung ist wiederholbar und idempotent; Fehler landen im Fehler-Tracking.
- **Kosten:** keine Nutzer-Kontingente; internes Monitoring von Aufnahme-Minuten und SMS pro Projekt, um Missbrauch zu erkennen.
- **Print-First:** Der erzeugte Text ist normaler Kapitel-Inhalt im selben Format wie getippter Text (eine Quelle für Bildschirm und späteres A5-PDF).

## Betroffene andere Features (Folgeänderungen)
- **PROJ-6:** Rückbau „Vapi +60 Min", Stat-Karte, Guthaben-Formel (siehe Refinement dort).
- **PROJ-11:** Mail „Vapi-Paket" entfällt, Text „10 Stunden Vapi-Erzählzeit" in Kauf-Mail entfällt; neue Mail-Typen dieser Spec nutzen dieselbe Infrastruktur.
- **PROJ-2 / PROJ-3:** Onboarding-Texte und -Schritte (diese Spec ist maßgeblich); Zahlungstyp-Anzeige „Vapi-Sprechzeit" im persönlichen Bereich nur noch als Altbestand.
- **PROJ-4:** Platzhalter „Code für das Telefonieren" und „Telefonzeit übrig".
- **PROJ-19:** `Permissions-Policy` für Mikrofon.

---

## Tech Design (Solution Architect)
**Stand:** 2026-10-13 — vom Nutzer freigegeben. Bewusst ohne Code.

### A) Komponenten-Struktur

```
Öffentliche Aufnahmeseite  /erzaehlen  (ohne Login, auch Phone)
+-- Link-Prüfung (läuft beim Öffnen)
|   +-- Neutrale Seite „Link nicht mehr gültig"
|   +-- Hinweis „Zu diesem Thema ist schon etwas geschrieben"
|   +-- Hinweis „Deine Geschichte ist schon angekommen"
+-- Begrüßung + Thema + Leitfragen
+-- Aufnahme-Baustein  (gemeinsam mit dem Portal genutzt)
|   +-- Mikrofon-Erklärung / Hilfe bei verweigerter Erlaubnis
|   +-- Großer Aufnahme-Knopf, Laufzeit, Pausieren / Fortsetzen
|   +-- Anhören, Neu aufnehmen, Absenden
|   +-- Upload-Fortschritt + Erneut senden
+-- Danke-Seite

Onboarding-Wizard (bestehend, erweitert)
+-- Schritt 3: neue Bezeichnungen der Erzählweise
+-- Schritt 4 NEU: „Wie erreichen wir [Name]?"
|   +-- E-Mail, Handynummer, Wochentag, Einverständnis-Häkchen
+-- Schritt 6: Zusammenfassung + neuer Preistext

Projektübersicht (bestehend, erweitert)
+-- Sektion „Erzählen per Sprachnachricht"   (ersetzt „Code für das Telefonieren")
|   +-- Status, nächste Aufforderung, Zustell-Hinweis
|   +-- Dialog „Kontakt & Wochentag ändern"   (nur Projektleiter)
+-- Kapitel-Liste
|   +-- Kennzeichen „Per Sprachnachricht erzählt"
|   +-- Status „Erzählung wird verarbeitet" / „Verarbeitung fehlgeschlagen"
|   +-- Aktion „Per Sprachnachricht erzählen"   (nur leere Kapitel)
+-- Aufnahme-Dialog   (enthält den Aufnahme-Baustein)

Kapitel-Editor (bestehend, erweitert)
+-- Leerer Zustand: Knopf „Per Sprachnachricht erzählen"
+-- Erzähl-Leiste: „Erzählt am …", Aufnahme anhören, Transkript ansehen
+-- Hinweis „Es liegt eine Erzählung vor" + „Text übernehmen"
    (nur wenn das Kapitel von Hand befüllt wurde und die Aufnahme nicht eingefügt werden durfte)

Im Hintergrund (Server)
+-- Täglicher Versand-Lauf: Aufforderungen + Erinnerungen
+-- Link-Dienst: prüfen, Upload freigeben, Einreichen annehmen
+-- Verarbeitungs-Lauf: Transkript holen → Text formulieren → ins Kapitel schreiben
+-- Empfang der Fertig-Meldung des Transkriptions-Dienstes (Server zu Server)
+-- Mails: Aufforderung, Erinnerung, „Neues Kapitel erzählt", „Alle Themen erzählt"
+-- SMS-Versand über seven.io
```

Alle Oberflächen nutzen die vorhandenen shadcn/ui-Bausteine (Dialog, Button, Input, Select, Checkbox, Progress, Alert, Badge) und die bestehende Farbpalette. Es wird kein UI-Grundbaustein neu gebaut.

### B) Datenmodell (in Alltagssprache)

**1. Erzähl-Einstellungen** — eine Zeile pro Projekt
- Name der erzählenden Person, E-Mail, Handynummer (mindestens ein Kontaktweg)
- Wochentag der Aufforderung
- Zeitpunkt der Einverständnis-Bestätigung durch den Käufer
- Zähler für fehlgeschlagene Zustellungen, Zeitpunkt „Alle Themen erzählt" gemeldet
- Eigene Tabelle, getrennt von den normalen Projektdaten: Nur der Projektleiter darf ändern. Co-Autoren bekommen die Kontaktwege nur teilmaskiert vom Server geliefert.

**2. Erzähl-Aufforderungen** — eine Zeile pro Projekt und Kapitel
- Projekt, Kapitel, genutzte Kanäle
- **Fingerabdruck (Hash) des Link-Geheimnisses** — das Geheimnis selbst wird nie gespeichert
- Versendet am, Erinnerung versendet am, gültig bis (30 Tage)
- Verbraucht am / widerrufen am mit Grund (Kontakt geändert, Zugang abgelaufen)
- Pro Projekt und Kapitel gibt es höchstens eine Aufforderung; das verhindert doppelten Versand, auch wenn der Versand-Lauf zweimal startet.
- Kein Zugriff für Browser oder eingeloggte Nutzer, ausschließlich für den Server.

**3. Aufnahmen** — eine Zeile pro eingereichter Aufnahme
- Projekt, Kapitel, Herkunft (Link oder Portal), ggf. zugehörige Aufforderung bzw. eingeloggtes Mitglied
- Speicherort der Audiodatei, Länge
- Status: hochgeladen → wird transkribiert → wird formuliert → **eingefügt** | **nicht eingefügt (Kapitel war befüllt)** | **nicht verwertbar** | **fehlgeschlagen**
- Roh-Transkript, erzeugter Text, Anzahl der Versuche, Fehlerhinweis
- Eindeutiger Einreich-Schlüssel gegen doppeltes Absenden
- Projektmitglieder dürfen lesen (für Anhören, Transkript, Übernehmen); schreiben darf nur der Server.

**4. Audio-Speicher** — neuer privater Ablagebereich, nach Projekt und Kapitel sortiert
- Nie öffentlich. Mitglieder hören über kurzlebige Abspiel-Freigaben; hochgeladen wird nur über einmalige Upload-Freigaben, die der Server ausstellt.

**5. Kapitel** — kleine Ergänzung
- Verweis auf die eingefügte Aufnahme und Zeitpunkt „erzählt am". Daraus entsteht das Kennzeichen „Per Sprachnachricht erzählt".
- Die bestehende Herkunft (eigenes Kapitel / Erzähl-Impuls) bleibt unverändert, weil sie etwas anderes beschreibt: woher das *Thema* kommt, nicht wie der *Text* entstand.

**Altlasten**
- Die bisherige Tabelle für Vapi-Anrufe wird nicht weiterverwendet (sie war auf Minuten-Guthaben ausgelegt) und im Zuge des PROJ-6-Rückbaus stillgelegt.
- Der Zahlungstyp für das Vapi-Paket bleibt als Altbestand bestehen.

### C) Tech-Entscheidungen (mit Begründung)

1. **Das Link-Geheimnis steht hinter dem `#` der Adresse.** Dieser Teil einer Web-Adresse wird vom Browser grundsätzlich nicht an Server übertragen. Damit taucht das Geheimnis weder in den Zugriffs-Logs des Hosters noch im Fehler-Tracking noch in Verweis-Informationen an andere Seiten auf. Die Seite liest es lokal aus und schickt es gezielt und verschlüsselt an unseren Link-Dienst. Folge: Klick-Tracking in den Mails und Link-Kürzung in SMS bleiben für diese Nachrichten ausgeschaltet.
2. **Geheimnis = 32 zufällige Bytes (256 Bit), gespeichert wird nur der Fingerabdruck.** Erraten ist praktisch ausgeschlossen, und selbst ein Datenbank-Leck liefert keine nutzbaren Links. Dasselbe Muster wie bei den Einladungen (PROJ-9), nur strenger.
3. **Der Link-Dienst ist der einzige Weg zu den Daten.** Die öffentliche Seite spricht nie direkt mit der Datenbank. Der Server prüft bei jedem Schritt Link, Kapitel-Zustand und Portal-Zugang und gibt nur Vorname, Titel und Leitfragen heraus.
4. **Audio geht direkt in den privaten Speicher, nicht durch unseren Server.** Der Hoster begrenzt die Größe von Anfragen auf wenige Megabyte; eine lange Aufnahme passt da nicht durch. Der Server stellt deshalb nach erfolgreicher Prüfung eine einmalige, kurz gültige Upload-Freigabe für genau eine Datei aus.
5. **Aufnahme im sparsamen Sprachformat.** Der Browser nimmt einkanalig und stark komprimiert auf; 60 Minuten ergeben grob 15–30 MB. Android/Chrome und iPhone/Safari liefern unterschiedliche Dateiformate — beide werden akzeptiert. Das iPhone-Verhalten ist der wichtigste frühe Praxistest.
6. **Verarbeitung als Schritt-für-Schritt-Auftrag mit gespeichertem Zwischenstand.** Jede Aufnahme trägt ihren Status in der Datenbank. Ein Verarbeitungs-Lauf erledigt immer nur den nächsten Schritt und speichert das Ergebnis. Bricht etwas ab, wird genau dort weitergemacht — nichts geht verloren, nichts wird doppelt erzeugt.
7. **Drei Anstöße für den Verarbeitungs-Lauf:** sofort nach dem Einreichen, bei der Fertig-Meldung des Transkriptions-Dienstes, und als Sicherheitsnetz alle paar Minuten über einen Zeitplan in der Datenbank. Das Sicherheitsnetz liegt bewusst in Supabase und nicht beim Hoster, damit es unabhängig vom Vercel-Tarif auch im Minutentakt läuft.
8. **Lange Texte werden abschnittsweise formuliert.** So bleibt jeder einzelne Schritt kurz genug für die Laufzeitgrenzen, und das Sprachmodell kürzt bei langen Erzählungen nicht stillschweigend. Zusätzlich prüft der Server grob die Länge: Ist der Text deutlich kürzer als das Transkript, wird neu formuliert bzw. gemeldet.
9. **Einfügen nur, wenn das Kapitel in diesem Moment noch leer ist.** Die Prüfung und das Schreiben passieren in einem einzigen, unteilbaren Datenbank-Schritt. Tippt jemand gleichzeitig, gewinnt immer das Handgeschriebene; die Erzählung bleibt an der Aufnahme und kann manuell übernommen werden.
10. **Täglicher Versand-Lauf nach dem Muster der Verlängerungs-Erinnerungen (PROJ-11).** Er läuft jeden Vormittag, wählt die Projekte mit passendem Wochentag (deutsche Zeit) und verschickt außerdem fällige Erinnerungen. Vor jeder Erinnerung wird geprüft, ob das Kapitel noch leer ist.
11. **Anbieter hinter Adaptern.** SMS, Transkription und Textformulierung bekommen je eine schmale interne Schnittstelle. SMS: **seven.io** (deutscher Anbieter, Server in Deutschland). Transkription und Sprachmodell sind **bewusst noch offen** und werden nach einem Vergleichstest gewählt (siehe F). Ein späterer Wechsel betrifft nur den jeweiligen Adapter; PROJ-14 baut auf derselben Schnittstelle auf.
12. **Mikrofon-Freigabe nur auf den Aufnahme-Seiten.** Überall sonst bleibt das Mikrofon per Sicherheits-Kopfzeile gesperrt (Abstimmung mit PROJ-19).
13. **Onboarding-Angaben reisen wie bisher über den Stripe-Checkout** und werden beim Anlegen des Projekts gespeichert. Kein neuer Mechanismus.
14. **Eigener Zugriffsschutz für die öffentlichen Endpunkte.** Begrenzung pro Link und pro Absender-Adresse. Da PROJ-17 (Rate-Limiting) noch nicht gebaut ist, wird PROJ-17 zur **Voraussetzung für den Live-Gang** von PROJ-12.

### D) Neue Abhängigkeiten
- **Telefonnummern-Prüfung** (z. B. `libphonenumber-js`) — gültige Handynummern im internationalen Format.
- **seven.io** — Anbindung über deren Web-Schnittstelle, kein zusätzliches Paket nötig.
- **Transkriptions- und Sprachmodell-Paket** — je nach Anbieterwahl, nur serverseitig.
- Keine neuen UI-Pakete; Aufnahme läuft über die eingebaute Browser-Funktion.

**Neue Zugangsdaten (nur Server):** seven.io-Schlüssel, Schlüssel + Signatur-Geheimnis des Transkriptions-Dienstes, Schlüssel des Sprachmodells, ein Geheimnis für den Verarbeitungs-Lauf.

### E) Abläufe (vereinfacht)

**Aufforderung → Kapitel**
1. Versand-Lauf wählt das nächste leere Kapitel, erzeugt ein Geheimnis, speichert dessen Fingerabdruck, verschickt Mail und/oder SMS.
2. Person öffnet den Link. Die Seite fragt den Link-Dienst: gültig? Kapitel noch leer?
3. Person nimmt auf und tippt „Absenden". Server prüft erneut, stellt die Upload-Freigabe aus, Audio landet im privaten Speicher.
4. Server legt die Aufnahme an, markiert die Aufforderung als verbraucht, zeigt „Danke".
5. Verarbeitungs-Lauf: Aufnahme an den Transkriptions-Dienst → Fertig-Meldung → Text abschnittsweise formulieren → einfügen, falls Kapitel noch leer.
6. Mail an Projektleiter und Co-Autoren: „[Name] hat ein neues Kapitel erzählt".

**Kapitel wurde inzwischen von Hand befüllt**
- Vor dem Öffnen: Link zeigt den freundlichen Hinweis, keine Aufnahme möglich; die Erinnerung entfällt; nächste Woche folgt das nächste leere Kapitel.
- Während der Aufnahme oder Verarbeitung: Aufnahme wird angenommen und verarbeitet, aber nicht eingefügt; Mitglieder sehen „Es liegt eine Erzählung vor".

**Erzählen im Portal**
- Gleicher Ablauf ab Schritt 3, nur dass statt des Links die Anmeldung und Projektmitgliedschaft geprüft werden.

### F) Offene Entscheidungen vor `/backend`
1. **Transkriptions-Dienst.** Muss-Kriterien: Verarbeitung in der EU, Auftragsverarbeitungsvertrag, keine Nutzung der Inhalte fürs Training, Aufnahmen bis 60 Minuten ohne eigenes Zerteilen, automatische signierte Fertig-Meldung. Kandidaten: AssemblyAI (EU), Deepgram (EU), OpenAI.
2. **Sprachmodell.** Muss-Kriterien: Auftragsverarbeitungsvertrag, kein Training mit den Inhalten, treues Glätten ohne Kürzen und Erfinden. Kandidaten: Claude, GPT.
3. **Vergleichstest:** 5–10 echte Aufnahmen älterer Sprecher (auch Dialekt, auch Handy-Qualität) durch die Kandidaten schicken und Ergebnisse nebeneinander beurteilen. Der Test kann laufen, während Oberfläche, Link-Dienst und Versand bereits gebaut werden.
4. **Recht:** kurze Prüfung, ob der wöchentliche Versand an eine dritte Person ohne Abmelde-Möglichkeit zulässig ist und ob seven.io ein Opt-out voraussetzt.
5. **Aufbewahrung:** wie lange Audiodateien nach Projektende bzw. Druck gespeichert bleiben.

### G) Bau-Reihenfolge (Empfehlung)
1. PROJ-6-Rückbau (Kontingent raus) — macht den Weg im Onboarding und in der Projektübersicht frei.
2. Datenmodell + Audio-Speicher.
3. Aufnahme-Baustein + Erzählen im Portal (ohne Link, ohne Versand) — früh auf iPhone und Android testen.
4. Verarbeitung mit den gewählten Anbietern.
5. Link-Dienst + öffentliche Aufnahmeseite.
6. Onboarding-Schritt + Einstellungen in der Projektübersicht.
7. Versand-Lauf (Mail, dann SMS) + Benachrichtigungs-Mails.
8. PROJ-17 Rate-Limiting vor dem Live-Gang.

### H) Sicherheit auf einen Blick
- Öffentliche Seite: kennt nur Vorname, Titel, Leitfragen; kann nur einreichen.
- Datenbank: Aufforderungen und Kontaktdaten sind für Browser unsichtbar; Aufnahmen nur für Projektmitglieder lesbar.
- Speicher: privat, nur einmalige Upload- und kurzlebige Abspiel-Freigaben.
- Eingehende Fertig-Meldungen werden per Signatur geprüft; der Verarbeitungs-Lauf ist per Geheimnis geschützt.
- Schlüssel aller Anbieter liegen ausschließlich auf dem Server.

## QA Test Results
_Offen._

## Deployment
_Offen._
