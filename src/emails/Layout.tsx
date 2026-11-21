// PROJ-11 — Layout-Wrapper für alle Transaktionsmails.
//
// Design: Figma-Datei „NARRAVIT Mails" (Jakob, 2026-11-18/19). Aufbau:
//   1. Kopf: Baum-Logo, Schriftzug „NARRAVIT", darunter die Kategorie-Zeile.
//   2. Weiße Inhalts-Karte mit Rahmen, optional mit Bild am oberen Rand.
//   3. Fuß: Kontakt-Hinweis, Impressum, Hinweis auf die Transaktions-Mail.
// Alles auf dem hellen Grund #FAF8F6.
//
// Wir verwenden React-Email-Komponenten (Container, Section, Text, …) statt
// klassischer HTML-Tags — die rendern tabellenbasiertes Email-HTML mit
// inline-Styles für Outlook-Kompatibilität. Keine Tailwind-/CSS-Klassen.
//
// Schriften: Mail-Programme laden keine Web-Fonts zuverlässig. Wir nennen die
// Figma-Schriften zuerst und fallen auf Systemschriften zurück (PT Serif ist
// auf dem Mac vorinstalliert, sonst Georgia).

import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

// Marken-Farben (globals.css + Figma)
export const COLORS = {
  sand: "#D0BCA6",
  sandHover: "#C0AD98",
  cream: "#F5EFE6",
  paper: "#FAF8F6",
  forest: "#2D372D",
  ink: "#3E3831",
  inkSecondary: "#535252",
  inkMuted: "#848484",
  border: "#E0DCD5",
  cardWhite: "#FFFFFF",
  greenAccent: "#96B897",
} as const;

const SERIF_HEADING = "'PT Serif', Georgia, 'Times New Roman', serif";
const SERIF_WORDMARK = "Merriweather, Georgia, 'Times New Roman', serif";
const SANS =
  "Lato, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";

// Empfohlene Mail-Container-Breite — typisch ~600 px in Gmail/Outlook-Lese-
// Bereich, schmaler auf Mobile.
const CONTAINER_WIDTH = 600;

/**
 * Das Impressum liegt auf der Webflow-Website, nicht in der App. Der Link ist
 * deshalb fest und auf Stage wie in Production gleich — so funktioniert er
 * auch in den Supabase-Vorlagen, die keine App-Adresse kennen.
 */
export const IMPRESSUM_URL = "https://www.narravit.de/impressum";

/**
 * Bilder in Mails brauchen eine öffentlich erreichbare Adresse. Sie liegen in
 * `public/images/mail/` und werden immer von der Production-App geladen:
 * Stage ist per Vercel-Deployment-Protection gesperrt, dort kämen Mail-
 * Programme nicht an die Bilder. Folge: Vor dem Go-live zeigen auch
 * Stage-Mails die Bilder erst, wenn app.narravit.de diese App ausliefert
 * (siehe docs/production/prod-umzug.md).
 */
export const MAIL_ASSETS_URL = "https://app.narravit.de/images/mail";

const LOGO = {
  src: `${MAIL_ASSETS_URL}/narravit-logo.png`,
  width: 110,
  height: 97,
};

/** Breite der Inhalts-Karte innen (600 − 2 × 24 Rand − 2 × 1 Rahmen). */
export const CARD_INNER_WIDTH = 550;

export type MailCardImage = {
  src: string;
  alt: string;
  /** Anzeige-Höhe bei voller Kartenbreite (550 px) */
  height: number;
};

type Props = {
  /** Preview-Text (erscheint in Mailbox-Vorschau direkt nach dem Betreff) */
  preview: string;
  /** Inhalt der Karte zwischen Header und Footer */
  children: ReactNode;
  /** Kategorie-Zeile im Kopf unter dem Schriftzug (z. B. „Willkommen") */
  headerEyebrow?: string;
  /** Optionales Bild am oberen Rand der Inhalts-Karte, volle Kartenbreite */
  cardImage?: MailCardImage;
};

export function Layout({
  preview,
  children,
  headerEyebrow,
  cardImage,
}: Props) {
  const kontaktEmail = "kontakt@narravit.de";

  return (
    <Html lang="de">
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: COLORS.paper,
          margin: 0,
          padding: 0,
          fontFamily: SANS,
          color: COLORS.ink,
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <Container
          style={{
            width: "100%",
            maxWidth: CONTAINER_WIDTH,
            margin: "0 auto",
            padding: 0,
            backgroundColor: COLORS.paper,
          }}
        >
          {/* ─── Kopf ─────────────────────────────────────────────── */}
          <Section
            style={{
              backgroundColor: COLORS.paper,
              padding: "32px 24px 8px",
              textAlign: "center",
            }}
          >
            {/* Leerer Alt-Text: Der Schriftzug darunter nennt den Namen. */}
            <Img
              src={LOGO.src}
              width={LOGO.width}
              height={LOGO.height}
              alt=""
              style={{ display: "block", margin: "0 auto" }}
            />
            <Text
              style={{
                margin: 0,
                paddingTop: 8,
                fontFamily: SERIF_WORDMARK,
                fontSize: 26,
                fontWeight: 300,
                lineHeight: "36px",
                color: COLORS.forest,
              }}
            >
              NARRAVIT
            </Text>
            {headerEyebrow ? (
              <Text
                style={{
                  margin: 0,
                  marginTop: 4,
                  fontFamily: SANS,
                  fontSize: 13,
                  fontWeight: 500,
                  lineHeight: "24px",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: COLORS.forest,
                }}
              >
                {headerEyebrow}
              </Text>
            ) : null}
          </Section>

          {/* ─── Inhalts-Karte ───────────────────────────────────── */}
          <Section
            style={{
              padding: "8px 24px 24px",
              backgroundColor: COLORS.paper,
            }}
          >
            <Container
              style={{
                width: "100%",
                backgroundColor: COLORS.cardWhite,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              {cardImage ? (
                <Img
                  src={cardImage.src}
                  width={CARD_INNER_WIDTH}
                  height={cardImage.height}
                  alt={cardImage.alt}
                  style={{
                    display: "block",
                    width: "100%",
                    maxWidth: CARD_INNER_WIDTH,
                    height: "auto",
                  }}
                />
              ) : null}
              <Section style={{ padding: "32px 28px" }}>{children}</Section>
            </Container>
          </Section>

          {/* ─── Fuß ─────────────────────────────────────────────── */}
          <Section
            style={{
              backgroundColor: COLORS.paper,
              padding: "8px 24px 48px",
              textAlign: "center",
            }}
          >
            <Text
              style={{
                margin: 0,
                fontFamily: SANS,
                fontSize: 12,
                lineHeight: "18px",
                color: COLORS.ink,
                opacity: 0.85,
              }}
            >
              Fragen oder Wünsche? Kontaktieren Sie uns unter{" "}
              <Link
                href={`mailto:${kontaktEmail}`}
                style={{ color: COLORS.ink, textDecoration: "underline" }}
              >
                {kontaktEmail}
              </Link>
              .
            </Text>
            <Text
              style={{
                margin: 0,
                marginTop: 12,
                fontFamily: SANS,
                fontSize: 11,
                lineHeight: "18px",
                color: COLORS.ink,
                opacity: 0.7,
              }}
            >
              <Link
                href={IMPRESSUM_URL}
                style={{ color: COLORS.ink, textDecoration: "underline" }}
              >
                Impressum
              </Link>
              {" · "}
              Dies ist eine Transaktions-E-Mail. Antworten Sie nicht auf diese
              Mail.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ─── Wiederverwendbare Sub-Komponenten ─────────────────────────────────────

export function MailHeading({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        margin: 0,
        marginBottom: 16,
        fontFamily: SERIF_HEADING,
        fontSize: 24,
        fontWeight: 400,
        lineHeight: "30px",
        color: COLORS.ink,
      }}
    >
      {children}
    </Text>
  );
}

export function MailParagraph({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        margin: 0,
        marginBottom: 16,
        fontFamily: SANS,
        fontSize: 15,
        lineHeight: "24px",
        color: COLORS.inkSecondary,
      }}
    >
      {children}
    </Text>
  );
}

/** Link im Fließtext (Mail-Adresse, Rechnung, Anmelden). */
export const mailLinkStyle = {
  color: COLORS.ink,
  textDecoration: "underline",
} as const;

/**
 * Schlüssel-Wert-Liste für Zahlungs-/Detail-Blöcke. Zwei feste Spalten: Lange
 * Werte brechen innerhalb ihrer Spalte um und bleiben eingerückt, auch auf
 * schmalen Bildschirmen. Eine Tabelle pro Zeile, damit die Klartext-Fassung
 * jede Angabe in einer eigenen Zeile zeigt.
 */
export function MailDetailsList({
  items,
}: {
  items: ReadonlyArray<{ label: string; value: ReactNode }>;
}) {
  return (
    <Container
      style={{
        margin: "16px 0",
        padding: "16px 18px",
        backgroundColor: COLORS.paper,
        border: `1px solid ${COLORS.border}`,
      }}
    >
      {items.map((item, idx) => {
        const cell = {
          fontFamily: SANS,
          fontSize: 14,
          lineHeight: 1.6,
          verticalAlign: "top",
          paddingBottom: idx === items.length - 1 ? 0 : 8,
        } as const;
        return (
          <table
            key={idx}
            role="presentation"
            width="100%"
            cellPadding={0}
            cellSpacing={0}
            border={0}
            style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%" }}
          >
            <tbody>
              <tr>
                <td
                  width="40%"
                  valign="top"
                  style={{ ...cell, width: "40%", paddingRight: 12, color: COLORS.inkMuted }}
                >
                  {/* Leerzeichen trennt Bezeichnung und Wert im Klartext */}
                  {item.label}{" "}
                </td>
                <td
                  width="60%"
                  valign="top"
                  style={{ ...cell, width: "60%", fontWeight: 600, color: COLORS.ink }}
                >
                  {item.value}
                </td>
              </tr>
            </tbody>
          </table>
        );
      })}
    </Container>
  );
}

/**
 * Primärer CTA-Button (Sand-Hintergrund), gebaut als Link statt
 * @react-email/components <Button>, um konsistente Farben zu garantieren und
 * keine Library-Default-Styles zu erben.
 */
export function MailCtaButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Container style={{ margin: "24px 0", textAlign: "center" }}>
      <Link
        href={href}
        style={{
          display: "inline-block",
          padding: "14px 28px",
          backgroundColor: COLORS.sand,
          color: COLORS.ink,
          fontFamily: SANS,
          fontSize: 15,
          fontWeight: 700,
          textDecoration: "none",
          letterSpacing: "0.02em",
          lineHeight: 1.2,
        }}
      >
        {children}
      </Link>
    </Container>
  );
}

/**
 * Sekundärer Inline-Link, falls man den Backup-Pfad als reinen Link
 * mit-anzeigen möchte (z. B. unter einem Button).
 */
export function MailInlineFallbackLink({
  href,
  label,
}: {
  href: string;
  label?: string;
}) {
  return (
    <Text
      style={{
        margin: 0,
        marginTop: 8,
        fontFamily: SANS,
        fontSize: 12,
        lineHeight: 1.5,
        color: COLORS.inkMuted,
        textAlign: "center",
      }}
    >
      {label ?? "Falls der Button nicht funktioniert, kopieren Sie diesen Link:"}
      <br />
      <Link
        href={href}
        style={{
          color: COLORS.inkSecondary,
          textDecoration: "underline",
          wordBreak: "break-all",
        }}
      >
        {href}
      </Link>
    </Text>
  );
}
