// PROJ-11 — Layout-Wrapper für alle Transaktionsmails.
//
// Aufbau:
//   1. Header-Banner mit narravit-Wordmark + Tagline (Sand-Hintergrund).
//   2. Body-Container (cremiger Hintergrund) mit weißer Inhalts-Karte.
//   3. Footer-Band (Sand-Hintergrund) mit Impressum + Kontakt-Hinweis.
//
// Wir verwenden React-Email-Komponenten (Container, Section, Heading, etc.)
// statt klassischer HTML-Tags — die rendern automatisch tabellenbasiertes
// Email-HTML mit inline-Styles für Outlook-Kompatibilität. Wir greifen
// NIEMALS auf Tailwind/CSS-Klassen zurück — alle Styles inline.
//
// Visueller Stil: Sand (#D0BCA6) als Marken-Akzent, Cream (#F5EFE6) als
// Body-BG, klassische Serif-Heading (Merriweather/system fallback),
// Sans-Serif-Body (Lato/system fallback).

import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

// Marken-Farben (1:1 aus globals.css)
export const COLORS = {
  sand: "#D0BCA6",
  sandHover: "#C0AD98",
  cream: "#F5EFE6",
  paper: "#FAF8F6",
  ink: "#3E3831",
  inkSecondary: "#535252",
  inkMuted: "#848484",
  border: "#E0DCD5",
  cardWhite: "#FFFFFF",
  greenAccent: "#96B897",
} as const;

const SERIF = "Merriweather, 'Times New Roman', Georgia, serif";
const SANS =
  "Lato, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";

// Empfohlene Mail-Container-Breite — typisch ~600 px in Gmail/Outlook-Lese-
// Bereich, schmaler auf Mobile.
const CONTAINER_WIDTH = 600;

type Props = {
  /** Preview-Text (erscheint in Mailbox-Vorschau direkt nach dem Betreff) */
  preview: string;
  /** Inhalt der Karte zwischen Header und Footer */
  children: ReactNode;
  /** Optionales kleines Label im Header über dem Wordmark (z. B. "Bestätigung") */
  headerEyebrow?: string;
  /**
   * Site-URL für absolute Links + Impressum. Wenn nicht angegeben, wird
   * `NEXT_PUBLIC_SITE_URL` aus der Server-Umgebung gelesen (Server-Render-
   * Time-Resolution). Wir nehmen den Param an als Default-Fallback.
   */
  siteUrl?: string;
  /**
   * Ersetzt den Impressum-Link im Footer durch eigenen Inhalt (z. B. die
   * Pflichtangaben direkt im Text). Wird von den Supabase-Auth-Vorlagen
   * genutzt, die keinen App-Link ins Impressum setzen können.
   */
  footerLegal?: ReactNode;
};

export function Layout({
  preview,
  children,
  headerEyebrow,
  siteUrl,
  footerLegal,
}: Props) {
  const baseUrl =
    siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://narravit.de";
  const impressumUrl = `${baseUrl}/impressum`;
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
            backgroundColor: COLORS.cream,
          }}
        >
          {/* ─── Header-Banner ────────────────────────────────────── */}
          <Section
            style={{
              backgroundColor: COLORS.sand,
              padding: "32px 24px",
              textAlign: "center",
            }}
          >
            {headerEyebrow ? (
              <Text
                style={{
                  margin: 0,
                  marginBottom: 8,
                  fontFamily: SANS,
                  fontSize: 13,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: COLORS.ink,
                  opacity: 0.7,
                }}
              >
                {headerEyebrow}
              </Text>
            ) : null}
            <Text
              style={{
                margin: 0,
                fontFamily: SERIF,
                fontSize: 32,
                fontWeight: 500,
                letterSpacing: "0.06em",
                color: COLORS.ink,
                lineHeight: 1.1,
              }}
            >
              NARRAVIT
            </Text>
            <Text
              style={{
                margin: 0,
                marginTop: 6,
                fontFamily: SANS,
                fontSize: 14,
                color: COLORS.ink,
                opacity: 0.85,
              }}
            >
              Lebensgeschichten zum Buch
            </Text>
          </Section>

          {/* ─── Inhalts-Karte ───────────────────────────────────── */}
          <Section
            style={{
              padding: "32px 24px",
              backgroundColor: COLORS.cream,
            }}
          >
            <Container
              style={{
                width: "100%",
                backgroundColor: COLORS.cardWhite,
                padding: "32px 28px",
                border: `1px solid ${COLORS.border}`,
              }}
            >
              {children}
            </Container>
          </Section>

          {/* ─── Footer-Band ─────────────────────────────────────── */}
          <Section
            style={{
              backgroundColor: COLORS.sand,
              padding: "20px 24px",
              textAlign: "center",
            }}
          >
            <Text
              style={{
                margin: 0,
                marginBottom: 4,
                fontFamily: SERIF,
                fontSize: 16,
                fontWeight: 500,
                letterSpacing: "0.04em",
                color: COLORS.ink,
              }}
            >
              narravit
            </Text>
            <Text
              style={{
                margin: 0,
                fontFamily: SANS,
                fontSize: 12,
                color: COLORS.ink,
                opacity: 0.85,
                lineHeight: 1.5,
              }}
            >
              Fragen oder Wünsche? Schreiben Sie uns an{" "}
              <Link
                href={`mailto:${kontaktEmail}`}
                style={{ color: COLORS.ink, textDecoration: "underline" }}
              >
                {kontaktEmail}
              </Link>
              .
            </Text>
            <Hr
              style={{
                borderColor: "rgba(62,56,49,0.18)",
                margin: "12px auto",
                width: "60%",
              }}
            />
            <Text
              style={{
                margin: 0,
                fontFamily: SANS,
                fontSize: 11,
                color: COLORS.ink,
                opacity: 0.7,
              }}
            >
              {footerLegal === undefined ? (
                <>
                  <Link
                    href={impressumUrl}
                    style={{ color: COLORS.ink, textDecoration: "underline" }}
                  >
                    Impressum
                  </Link>
                  {" · "}
                </>
              ) : null}
              Dies ist eine Transaktions-E-Mail. Antworten landen nicht im
              Posteingang.
              {footerLegal !== undefined ? (
                <>
                  <br />
                  {footerLegal}
                </>
              ) : null}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ─── Wiederverwendbare Sub-Komponenten ─────────────────────────────────────

/**
 * Standard-Anrede + Body-Block-Wrapper. Verwendet die marken-typischen
 * Schriftgrößen/-farben für den Mail-Body.
 */
export function MailHeading({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        margin: 0,
        marginBottom: 16,
        fontFamily: SERIF,
        fontSize: 24,
        fontWeight: 500,
        lineHeight: 1.25,
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
        lineHeight: 1.6,
        color: COLORS.inkSecondary,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * Schlüssel-Wert-Liste für Zahlungs-/Detail-Blöcke. Wird tabellarisch
 * gerendert (Render-Time React-Email löst das in <table> auf).
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
      {items.map((item, idx) => (
        <Text
          key={idx}
          style={{
            margin: 0,
            marginBottom: idx === items.length - 1 ? 0 : 8,
            fontFamily: SANS,
            fontSize: 14,
            lineHeight: 1.6,
            color: COLORS.ink,
          }}
        >
          <span
            style={{
              display: "inline-block",
              minWidth: 130,
              color: COLORS.inkMuted,
            }}
          >
            {item.label}
          </span>
          {/* Leerzeichen trennt Bezeichnung und Wert in der Klartext-Fassung */}
          {" "}
          <span style={{ fontWeight: 600 }}>{item.value}</span>
        </Text>
      ))}
    </Container>
  );
}

/**
 * Primärer CTA-Button (Sand-Hintergrund). Verwendet `<Button>` von React-
 * Email für korrektes VML-Rendering in Outlook.
 */
export function MailCtaButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  // Wir bauen den Button manuell als Tabelle-mit-Text-Link statt
  // @react-email/components <Button>, um konsistente Farben zu garantieren
  // und keine Library-Default-Styles zu erben.
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
