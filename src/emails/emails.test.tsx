// @vitest-environment node
import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import {
  GuestPurchaseEmail,
  InvitationEmail,
  PortalPurchaseEmail,
  RenewalEmail,
  ReminderEmail,
  WelcomeEmail,
} from "./index";
import { encodeNonAscii } from "./encoding";
import { MAIL_ASSETS_URL } from "./Layout";

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
    name: "GuestPurchaseEmail",
    element: GuestPurchaseEmail({
      fullName: "Maria Muster",
      buyerEmail: "maria@example.test",
      amountFormatted: "249,00 €",
      paymentDateFormatted: "16. November 2026",
      siteUrl,
    }),
    // Kauf ohne Konto: Zahlung bestätigt, Konto-Anlage als nächster Schritt,
    // mit der Adresse aus dem Checkout (nur so wird der Kauf zugeordnet).
    mustContain: [
      "Betrag 249,00 €",
      "Konto anlegen",
      "maria@example.test",
      `${siteUrl}/registrieren?next=%2Fkauf-einloesen`,
      `${siteUrl}/anmelden?next=%2Fkauf-einloesen`,
    ],
  },
  {
    name: "GuestPurchaseEmail (Geschenk)",
    element: GuestPurchaseEmail({
      fullName: "Maria Muster",
      buyerEmail: "maria@example.test",
      amountFormatted: "249,00 €",
      paymentDateFormatted: "16. November 2026",
      isGift: true,
      siteUrl,
    }),
    mustContain: ["Damit wir Ihr Geschenk versenden und Sie das Projekt verwalten"],
  },
  {
    name: "GuestPurchaseEmail (mit persönlichem Link)",
    element: GuestPurchaseEmail({
      fullName: "Maria Muster",
      buyerEmail: "maria@example.test",
      amountFormatted: "249,00 €",
      paymentDateFormatted: "16. November 2026",
      claimCode: "abc_DEF-123",
      siteUrl,
    }),
    mustContain: [
      "auch mit einer anderen E-Mail-Adresse",
      `${siteUrl}/kauf-zuordnen?code=abc_DEF-123&ziel=registrieren`,
      `${siteUrl}/kauf-zuordnen?code=abc_DEF-123&ziel=anmelden`,
    ],
  },
  {
    name: "RenewalEmail",
    element: RenewalEmail({
      fullName: "Maria Muster",
      projectName: "Omas Lebensbuch",
      projectId: "p1",
      amountFormatted: "99,00 €",
      paymentDateFormatted: "13. Oktober 2026",
      newExpiresAtFormatted: "13. Oktober 2028",
      siteUrl,
    }),
    // Projekt als erste Zeile der Box (wie Mail 09), Hinweis auf Mail 10b.
    mustContain: [
      "Projekt Omas Lebensbuch",
      "Zur Projektübersicht",
      `${siteUrl}/projektuebersicht/p1`,
      "99,00 €",
      "13. Oktober 2028",
      "Falls es im Projekt noch weitere Mitglieder gibt, wurden sie per E-Mail über die Verlängerung informiert.",
    ],
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
    mustContain: ["Nur noch 1 Tag Projektzugang", "14. Oktober 2026"],
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
      "Lena Muster schenkt Ihnen ein Buch-Projekt",
      "am Computer oder einem Tablet aufschreiben oder ganz einfach per Sprachnachricht erzählen",
      "Wir unterstützen Sie dabei. Wir senden Ihnen von nun an regelmäßige Erzähl-Impulse",
      `${siteUrl}/einladung/tok_gift`,
      "Geschenk annehmen",
    ],
  },
  {
    name: "PortalPurchaseEmail (Kauf für sich selbst, mit Projekt)",
    element: PortalPurchaseEmail({
      fullName: "Maria Muster",
      amountFormatted: "249,00 €",
      paymentDateFormatted: "13. Oktober 2026",
      expiresAtFormatted: "13. Oktober 2027",
      siteUrl,
      projectId: "p1",
    }),
    mustContain: [
      "Ihr Projektzugang ist freigeschaltet",
      "Zur Projektübersicht",
      `${siteUrl}/projektuebersicht/p1`,
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
      projectId: "p1",
      giftRecipientEmail: "oma@example.test",
    }),
    mustContain: [
      "Ihr Geschenk ist unterwegs",
      "einen Blick ins Projekt werfen",
      "Das Geschenk an oma@example.test ist unterwegs.",
      `${siteUrl}/projektuebersicht/p1`,
    ],
  },
  {
    name: "PortalPurchaseEmail (Geschenk nur per Sprachnachricht)",
    element: PortalPurchaseEmail({
      fullName: "Lena Muster",
      amountFormatted: "249,00 €",
      paymentDateFormatted: "14. Oktober 2026",
      expiresAtFormatted: "14. Oktober 2027",
      siteUrl,
      giftRecipientName: "Oma Erna",
    }),
    mustContain: [
      "Ihr Geschenk ist unterwegs",
      "den finalen Druckauftrag",
      "Das Geschenk an Oma Erna ist unterwegs.",
    ],
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
    mustContain: [
      "Ihr Geschenk ist unterwegs",
      "das Geschenk an oma@example.test gesendet",
      "Betrag 249,00 €",
      "erhalten Sie selbst keinen Zugang zum Projekt",
    ],
  },
  {
    name: "RenewalEmail (Info an andere Mitglieder)",
    element: RenewalEmail({
      fullName: "Lena Muster",
      renewedBy: "Maria Muster",
      projectName: "Omas Lebensbuch",
      newExpiresAtFormatted: "14. Oktober 2028",
      siteUrl,
    }),
    mustContain: [
      "Maria Muster hat den Projektzugang für „Omas Lebensbuch“ um weitere 12 Monate verlängert",
      "Projekt Omas Lebensbuch",
      "Neuer Zugang gültig bis 14. Oktober 2028",
    ],
  },
  {
    name: "WelcomeEmail",
    element: WelcomeEmail({ fullName: "Maria Muster", siteUrl }),
    mustContain: ["Maria", "Jetzt eigenes Buch beginnen"],
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
    // Das Impressum liegt auf der Website (Webflow), nicht in der App.
    expect(html).toContain('href="https://www.narravit.de/impressum"');
    expect(html).not.toContain(`${siteUrl}/impressum`);
    expect(html).toContain("kontakt@narravit.de");
    expect(html).toContain("Kontaktieren Sie uns");
    expect(html).toContain("Antworten Sie nicht auf diese Mail.");
  });

  // Reines ASCII übersteht jede Zeichenkodierung; der Inhalt bleibt gleich.
  it("encodes to pure ASCII without changing the content", async () => {
    const html = await render(element);
    const encoded = encodeNonAscii(html);
    expect(encoded).not.toMatch(/[^\x00-\x7F]/);
    const decoded = encoded.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
    expect(decoded).toBe(html);
  });

  it("loads the logo from the production app (Stage is access-protected)", async () => {
    const html = await render(element);
    expect(html).toContain(`src="${MAIL_ASSETS_URL}/narravit-logo.png"`);
    expect(MAIL_ASSETS_URL).toBe("https://app.narravit.de/images/mail");
  });
});

describe("WelcomeEmail image", () => {
  it("shows the beach photo at the top of the card with alt text", async () => {
    const html = await render(WelcomeEmail({ fullName: "Maria Muster", siteUrl }));
    expect(html).toContain(`src="${MAIL_ASSETS_URL}/willkommen-strand.jpg"`);
    expect(html).toMatch(/alt="[^"]*Holzsteg[^"]*"/);
  });

  it("is the only mail with a card image", async () => {
    for (const t of templates.filter((t) => t.name !== "WelcomeEmail")) {
      const html = await render(t.element);
      expect(html).not.toContain("willkommen-strand.jpg");
    }
  });
});

// Geschenk-Einladungen gelten so lange wie der Projektzugang (2026-11-18).
// Die 14 Tage gelten nur für normale Einladungen an Co-Autoren.
describe.each(templates.filter((t) => t.name.includes("Geschenk")))("$name", ({ element }) => {
  it("does not promise the 14-day limit of regular invitations", async () => {
    const text = await render(element, { plainText: true });
    expect(text).not.toContain("14 Tage");
  });
});

// Namen und Projekttitel sind frei wählbarer Text. Sie dürfen in keiner Mail
// als HTML ankommen (QA 2026-11-22).
describe("Nutzereingaben in Mails", () => {
  const payload = "<img src=x onerror=alert(1)>";
  const payment = {
    amountFormatted: "249,00 €",
    paymentDateFormatted: "22. November 2026",
  };
  const cases: Array<[string, ReactElement]> = [
    [
      "Einladung",
      InvitationEmail({
        inviterName: payload,
        inviterEmail: "maria@example.test",
        projectName: payload,
        role: "co_author",
        token: "tok_123",
        siteUrl,
      }),
    ],
    [
      "Geschenk-Einladung",
      InvitationEmail({
        inviterName: payload,
        inviterEmail: "maria@example.test",
        projectName: payload,
        role: "projektleiter",
        token: "tok_123",
        siteUrl,
        isGift: true,
      }),
    ],
    [
      "Kauf",
      PortalPurchaseEmail({
        fullName: payload,
        ...payment,
        expiresAtFormatted: "22. November 2027",
        siteUrl,
        giftRecipientName: payload,
      }),
    ],
    ["Kauf ohne Konto", GuestPurchaseEmail({ fullName: payload, buyerEmail: payload, ...payment, siteUrl })],
    ["Willkommen", WelcomeEmail({ fullName: payload, siteUrl })],
    [
      "Erinnerung",
      ReminderEmail({
        fullName: payload,
        projectName: payload,
        expiresAtFormatted: "22. Dezember 2026",
        daysLeft: 30,
        variant: "30",
        renewUrl: `${siteUrl}/projektuebersicht/p1`,
        siteUrl,
      }),
    ],
    [
      "Verlängerung",
      RenewalEmail({
        fullName: payload,
        projectName: payload,
        ...payment,
        newExpiresAtFormatted: "22. November 2027",
        siteUrl,
      }),
    ],
    [
      "Verlängerungs-Info",
      RenewalEmail({
        fullName: payload,
        renewedBy: payload,
        projectName: payload,
        newExpiresAtFormatted: "22. November 2027",
        siteUrl,
      }),
    ],
  ];

  it.each(cases)("%s zeigt Eingaben nur als Text", async (_name, element) => {
    const html = await render(element);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});
