// @vitest-environment node
import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import {
  InvitationEmail,
  PortalPurchaseEmail,
  RenewalEmail,
  ReminderEmail,
  WelcomeEmail,
} from "./index";

// PROJ-11 QA — Inhalts-Regression für alle Transaktionsmails.
//
// Prüft pro Vorlage: rendert ohne Fehler, durchgängige Sie-Anrede
// (Anforderung 2026-10-13), keine Vapi-/Telefon-Reste nach dem
// PROJ-6-Rückbau, Footer mit Impressum + Kontaktadresse.

const siteUrl = "https://app.example.test";

const templates: Array<{ name: string; element: ReactElement; mustContain: string[] }> = [
  {
    name: "InvitationEmail",
    element: InvitationEmail({
      inviterName: "Maria Muster",
      inviterEmail: "maria@example.test",
      projectName: "Omas Lebensbuch",
      role: "co_author",
      token: "tok_123",
      siteUrl,
    }),
    mustContain: ["Maria Muster", "Omas Lebensbuch", `${siteUrl}/einladung/tok_123`, "14 Tage"],
  },
  {
    name: "PortalPurchaseEmail",
    element: PortalPurchaseEmail({
      fullName: "Maria Muster",
      amountFormatted: "249,00 €",
      paymentDateFormatted: "13. Oktober 2026",
      expiresAtFormatted: "13. Oktober 2027",
      siteUrl,
    }),
    // „Betrag 249,00 €": Bezeichnung und Wert getrennt (Klartext-Fassung)
    mustContain: ["Betrag 249,00 €", "13. Oktober 2027"],
  },
  {
    name: "RenewalEmail",
    element: RenewalEmail({
      fullName: "Maria Muster",
      amountFormatted: "99,00 €",
      paymentDateFormatted: "13. Oktober 2026",
      newExpiresAtFormatted: "13. Oktober 2028",
      siteUrl,
    }),
    mustContain: ["99,00 €", "13. Oktober 2028"],
  },
  {
    name: "ReminderEmail (30)",
    element: ReminderEmail({
      fullName: "Maria Muster",
      projectName: "Omas Lebensbuch",
      expiresAtFormatted: "12. November 2026",
      daysLeft: 30,
      variant: "30",
      renewUrl: `${siteUrl}/projektuebersicht/p1`,
      siteUrl,
    }),
    mustContain: ["Omas Lebensbuch", "12. November 2026", `${siteUrl}/projektuebersicht/p1`],
  },
  {
    name: "ReminderEmail (7)",
    element: ReminderEmail({
      projectName: "Omas Lebensbuch",
      expiresAtFormatted: "20. Oktober 2026",
      daysLeft: 7,
      variant: "7",
      renewUrl: `${siteUrl}/projektuebersicht/p1`,
      siteUrl,
    }),
    mustContain: ["Omas Lebensbuch", "20. Oktober 2026", "Nur noch 7 Tage"],
  },
  {
    name: "ReminderEmail (7, nachgeholt am letzten Tag)",
    element: ReminderEmail({
      projectName: "Omas Lebensbuch",
      expiresAtFormatted: "14. Oktober 2026",
      daysLeft: 1,
      variant: "7",
      renewUrl: `${siteUrl}/projektuebersicht/p1`,
      siteUrl,
    }),
    mustContain: ["Nur noch 1 Tag Portal-Zugang", "14. Oktober 2026"],
  },
  {
    name: "InvitationEmail (Geschenk)",
    element: InvitationEmail({
      inviterName: "Lena Muster",
      inviterEmail: "lena@example.test",
      projectName: "Lebensgeschichten",
      role: "projektleiter",
      token: "tok_gift",
      siteUrl,
      isGift: true,
    }),
    mustContain: [
      "Lena Muster schenkt Ihnen ein Lebensbuch",
      `${siteUrl}/einladung/tok_gift`,
      "14 Tage",
      "Geschenk annehmen",
    ],
  },
  {
    name: "PortalPurchaseEmail (Geschenk mit eigenem Zugang)",
    element: PortalPurchaseEmail({
      fullName: "Lena Muster",
      amountFormatted: "249,00 €",
      paymentDateFormatted: "14. Oktober 2026",
      expiresAtFormatted: "14. Oktober 2027",
      siteUrl,
      giftRecipientEmail: "oma@example.test",
    }),
    mustContain: ["Portal-Zugang ist freigeschaltet", "Die Einladung an oma@example.test"],
  },
  {
    name: "PortalPurchaseEmail (Geschenk ohne eigenen Zugang)",
    element: PortalPurchaseEmail({
      fullName: "Lena Muster",
      amountFormatted: "249,00 €",
      paymentDateFormatted: "14. Oktober 2026",
      expiresAtFormatted: "14. Oktober 2027",
      siteUrl,
      giftRecipientEmail: "oma@example.test",
      buyerHasAccess: false,
    }),
    mustContain: ["Ihr Geschenk ist unterwegs", "oma@example.test", "Betrag 249,00 €"],
  },
  {
    name: "WelcomeEmail",
    element: WelcomeEmail({ fullName: "Maria Muster", siteUrl }),
    mustContain: ["Maria"],
  },
];

describe.each(templates)("$name", ({ element, mustContain }) => {
  it("renders HTML and plain text with the expected content", async () => {
    const html = await render(element);
    const text = await render(element, { plainText: true });
    expect(html.length).toBeGreaterThan(500);
    for (const fragment of mustContain) {
      expect(text).toContain(fragment);
    }
  });

  it("uses the Sie form throughout (no du/dein/dir/dich)", async () => {
    const text = await render(element, { plainText: true });
    expect(text).not.toMatch(/\b(du|dich|dir|dein|deine|deinem|deinen|deiner|deines)\b/i);
    expect(text).toMatch(/\b(Sie|Ihr|Ihre|Ihren|Ihrem|Ihnen)\b/);
  });

  it("contains no Vapi or telephone leftovers", async () => {
    const text = await render(element, { plainText: true });
    expect(text).not.toMatch(/vapi|telefon|erzählzeit|10 Stunden/i);
  });

  it("has the footer with Impressum link and support address", async () => {
    const html = await render(element);
    expect(html).toContain(`${siteUrl}/impressum`);
    expect(html).toContain("kontakt@narravit.de");
  });
});
