// PROJ-11 — Ablauf-Reminder (30- oder 7-Tage-Variante).
//
// Trigger: täglicher Vercel-Cron-Job (/api/cron/reminders). Die 30-Tage-
// Variante geht raus, sobald der Zugang in 30 Tagen oder weniger abläuft,
// die 7-Tage-Variante ab 7 Tagen. Fällt ein Cron-Lauf aus, holt der
// nächste die Erinnerung nach — deshalb nennt die Mail die tatsächlich
// verbleibenden Tage (`daysLeft`) statt fest „30" bzw. „7".
//
// Eine Komponente, zwei Varianten — gesteuert per `variant`-Prop.
// Beide Mails verlinken auf den Verlängerungs-Stripe-Checkout (PROJ-6).

import type { ReactNode } from "react";
import { CONTENT_RETENTION_DAYS } from "@/lib/projects/project-access";
import {
  Layout,
  MailHeading,
  MailParagraph,
  MailCtaButton,
  MailDetailsList,
} from "./Layout";

export type ReminderVariant = "30" | "7";

export type ReminderEmailProps = {
  fullName?: string;
  projectName: string;
  /** Ablauf-Datum, z. B. „22. Juni 2026" */
  expiresAtFormatted: string;
  /** Verbleibende Tage bis zum Ablauf (≥ 1) */
  daysLeft: number;
  variant: ReminderVariant;
  /** Verlängerungs-Checkout-URL (z. B. /onboarding?type=renewal&project=…) */
  renewUrl: string;
  siteUrl: string;
};

/** „1 Tag" / „7 Tage" */
function daysNominative(daysLeft: number): string {
  return daysLeft === 1 ? "1 Tag" : `${daysLeft} Tage`;
}

/** „einem Tag" / „30 Tagen" (nach „in") */
function daysDative(daysLeft: number): string {
  return daysLeft === 1 ? "einem Tag" : `${daysLeft} Tagen`;
}

// Texte: Figma-Frames 08 und 09 (Jakob, 2026-11-19).
const HEADINGS: Record<ReminderVariant, (daysLeft: number) => string> = {
  "30": (d) => `Ihr Projektzugang läuft in ${daysDative(d)} ab`,
  "7": (d) => `Nur noch ${daysNominative(d)} Projektzugang`,
};

const TONE: Record<ReminderVariant, (daysLeft: number, projectName: string) => ReactNode> = {
  "30": (d, projectName) => (
    <>
      ein freundlicher Hinweis: Ihr Projektzugang für{" "}
      <strong>„{projectName}“</strong> läuft in {daysDative(d)} ab. Falls Sie
      weiter schreiben möchten, können Sie den Zugang jetzt um 12 Monate
      verlängern.
    </>
  ),
  "7": (d) =>
    `nur noch ${daysNominative(d)}: Ihr Projektzugang läuft am unten genannten Datum ab. Wenn Sie weiter am Projekt arbeiten möchten, verlängern Sie den Zugang bitte rechtzeitig, sonst verlieren Sie kurzzeitig den Zugriff.`,
};

const CTA_LABEL: Record<ReminderVariant, string> = {
  "30": "Jetzt verlängern",
  "7": "Jetzt verlängern",
};

const EYEBROW: Record<ReminderVariant, string> = {
  "30": "Erinnerung",
  "7": "Wichtiger Hinweis",
};

const PREVIEW: Record<
  ReminderVariant,
  (project: string, date: string, daysLeft: number) => string
> = {
  "30": (project, date) =>
    `Ihr NARRAVIT-Projektzugang für „${project}" läuft am ${date} ab.`,
  "7": (project, date, d) =>
    `Nur noch ${daysNominative(d)}: Projektzugang für „${project}" läuft am ${date} ab.`,
};

export function ReminderEmail({
  fullName,
  projectName,
  expiresAtFormatted,
  daysLeft,
  variant,
  renewUrl,
  siteUrl,
}: ReminderEmailProps) {
  const greeting = fullName?.trim()
    ? `Hallo ${fullName.trim()},`
    : "Hallo,";

  const details: Array<{ label: string; value: string }> = [
    { label: "Projekt", value: projectName },
    { label: "Zugang läuft ab am", value: expiresAtFormatted },
  ];

  return (
    <Layout
      preview={PREVIEW[variant](projectName, expiresAtFormatted, daysLeft)}
      headerEyebrow={EYEBROW[variant]}
    >
      <MailHeading>{HEADINGS[variant](daysLeft)}</MailHeading>
      <MailParagraph>{greeting}</MailParagraph>
      <MailParagraph>{TONE[variant](daysLeft, projectName)}</MailParagraph>

      <MailDetailsList items={details} />

      <MailCtaButton href={renewUrl}>{CTA_LABEL[variant]}</MailCtaButton>

      <MailParagraph>
        Falls Sie das Projekt nicht weiterführen möchten, müssen Sie nichts
        unternehmen — der Zugang läuft dann einfach aus, Ihre Inhalte
        bleiben noch {CONTENT_RETENTION_DAYS} weitere Tage erhalten und können
        bei einer späteren Verlängerung wieder bearbeitet werden.
      </MailParagraph>
    </Layout>
  );
}
