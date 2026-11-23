import { test, expect, type Page } from "@playwright/test";

// PROJ-24 — Onboarding im Browser. Die Tests gehen bis zum letzten Schritt,
// starten aber keinen Kauf und schreiben nichts in die Datenbank.

const weiter = (page: Page) => page.getByRole("button", { name: "Weiter" }).click();

async function toNarration(
  page: Page,
  path: "self" | "phone-only" | "computer",
  name = "Max Mustermann",
) {
  await page.goto("/onboarding");
  await page
    .getByRole("button", { name: path === "self" ? /Für mich selbst/ : /Als Geschenk/ })
    .click();
  await weiter(page);
  await page.getByLabel("Vor- und Nachnamen").fill(name);
  await weiter(page);
  if (path === "self") return;
  await page.getByLabel("Name der beschenkten Person").fill("Oma Helga");
  await page
    .getByRole("button", {
      name: path === "phone-only" ? /Nur per Sprachnachricht erzählen/ : /Auch am Computer schreiben/,
    })
    .click();
  await weiter(page);
}

const auditCard = () => {
  const root = document.querySelector("section")!;
  const problems: string[] = [];
  for (const el of Array.from(root.querySelectorAll("*"))) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || el.closest("header, .sr-only")) continue;
    const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
    if (own && parseFloat(getComputedStyle(el).fontSize) < 16) {
      problems.push(`klein: ${(el.textContent ?? "").slice(0, 30)}`);
    }
    if (el.matches("a,button:not([role=checkbox]),input,textarea") && !el.closest("p")) {
      if (rect.height < 44) problems.push(`Button: ${(el.textContent ?? "").slice(0, 30)}`);
    }
    if (rect.right > innerWidth + 1 && el.tagName !== "IMG") problems.push(`außerhalb: ${el.tagName}`);
  }
  return Array.from(new Set(problems));
};

test.describe("PROJ-24 — Onboarding als Gast", () => {
  test("AC-14: Gast für sich selbst braucht keine E-Mail im Schritt", async ({ page }) => {
    await toNarration(page, "self");
    await expect(
      page.getByRole("heading", { name: "Möchten Sie regelmäßig Erzähl-Impulse bekommen?" }),
    ).toBeVisible();
    await expect(page.locator("#narrationEmail")).toHaveCount(0);
    await expect(page.getByText(/mit der Sie gleich bezahlen/)).toBeVisible();
    await expect(page.getByLabel(/Ich bestätige/)).toHaveCount(0);
    await weiter(page);
    await expect(page.getByRole("heading", { name: "Bereit zum Start?" })).toBeVisible();
    await expect(page.getByText("Per E-Mail, jeden Sonntag")).toBeVisible();
  });

  test("AC-9, AC-16: Nur per Sprachnachricht verlangt Kontakt und Einverständnis", async ({ page }) => {
    await toNarration(page, "phone-only");
    await expect(page.getByRole("heading", { name: "Wie erreichen wir Oma Helga?" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Nein, danke/ })).toHaveCount(0);
    await weiter(page);
    await expect(page.getByText("Bitte geben Sie eine gültige E-Mail-Adresse an.")).toBeVisible();
    await expect(page.getByText("Bitte bestätigen Sie, dass Oma Helga einverstanden ist.")).toBeVisible();
    await expect(page.locator("#narrationEmail")).toBeFocused();
  });

  test("AC-12, AC-13: SMS prüft die Handynummer direkt am Feld", async ({ page }) => {
    await toNarration(page, "phone-only");
    await page.getByRole("button", { name: "Per SMS", exact: true }).click();
    await expect(page.locator("#narrationEmail")).toHaveCount(0);
    await page.locator("#narrationPhone").fill("030 1234567");
    await page.getByLabel(/Ich bestätige/).check();
    await weiter(page);
    await expect(page.getByText(/gültige Handynummer/)).toBeVisible();
    await page.locator("#narrationPhone").fill("0171 1234567");
    await weiter(page);
    await expect(page.getByText("Per SMS, jeden Sonntag")).toBeVisible();
  });

  test("AC-12: Bei beidem erscheinen beide Felder", async ({ page }) => {
    await toNarration(page, "phone-only");
    await page.getByRole("button", { name: "Per E-Mail und SMS" }).click();
    await expect(page.locator("#narrationEmail")).toBeVisible();
    await expect(page.locator("#narrationPhone")).toBeVisible();
  });

  test("AC-10, AC-11: Geschenk mit Computer darf die Impulse abwählen", async ({ page }) => {
    await toNarration(page, "computer");
    await expect(
      page.getByRole("heading", { name: "Soll Oma Helga regelmäßig Erzähl-Impulse bekommen?" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Ja, gerne/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /Nein, danke/ }).click();
    await expect(page.locator("#narrationEmail")).toHaveCount(0);
    await weiter(page);
    await expect(page.getByRole("heading", { name: "Zugang einrichten" })).toBeVisible();
    await page.locator("#recipientEmail").fill("oma@example.test");
    await weiter(page);
    await expect(page.locator("dd", { hasText: /^Keine$/ })).toBeVisible();
  });

  test("AC-20: Die E-Mail wandert vorbefüllt in die Einladung", async ({ page }) => {
    await toNarration(page, "computer");
    await page.locator("#narrationEmail").fill("oma@example.test");
    await page.getByLabel(/Ich bestätige/).check();
    await weiter(page);
    await expect(page.locator("#recipientEmail")).toHaveValue("oma@example.test");
  });

  test("AC-21, AC-22: Preistext nennt das Buch zuerst", async ({ page }) => {
    await toNarration(page, "self");
    await weiter(page);
    await expect(
      page.getByText(
        "Ihr erstes gedrucktes Hardcover-Buch, 12 Monate Projektzugang, Erzählen per Sprachnachricht und Editor.",
      ),
    ).toBeVisible();
  });

  test("AC-24, AC-25: Neuladen und Abbruch bei Stripe behalten die Angaben", async ({ page }) => {
    await toNarration(page, "phone-only");
    await page.locator("#narrationEmail").fill("oma@example.test");
    await page.reload();
    await expect(page.locator("#narrationEmail")).toHaveValue("oma@example.test");
    await page.getByLabel(/Ich bestätige/).check();
    await weiter(page);
    await page.goto("/onboarding?checkout=cancelled");
    await expect(page.getByRole("heading", { name: "Bereit zum Start?" })).toBeVisible();
    await expect(page.locator("dd", { hasText: "Oma Helga" })).toBeVisible();
  });

  test("AC-26: Neuer Tab startet leer", async ({ page, context }) => {
    await toNarration(page, "self", "Erika Muster");
    const other = await context.newPage();
    await other.goto("/onboarding");
    await expect(other.getByRole("heading", { name: "Für wen ist das Lebensbuch?" })).toBeVisible();
    await other.close();
  });

  test("Edge: Wechsel zum eigenen Kauf nimmt fremde Daten nicht mit", async ({ page }) => {
    await toNarration(page, "phone-only");
    await page.getByRole("button", { name: "Per SMS", exact: true }).click();
    await page.locator("#narrationPhone").fill("0171 1234567");
    for (let i = 0; i < 3; i += 1) await page.getByRole("button", { name: "Zurück" }).click();
    await page.getByRole("button", { name: /Für mich selbst/ }).click();
    await weiter(page);
    await weiter(page);
    await expect(page.getByRole("button", { name: "Per E-Mail", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("#narrationPhone")).toHaveCount(0);
  });

  test("AC-2, AC-3, AC-7: Alle Schritte sind lesbar und laufen nicht über", async ({ page }) => {
    for (const [width, height] of [[1440, 900], [768, 1024], [375, 812], [720, 500]] as const) {
      await page.setViewportSize({ width, height });
      await toNarration(page, "computer");
      await page.getByRole("button", { name: "Per E-Mail und SMS" }).click();
      expect(await page.evaluate(auditCard), `Erzähl-Impulse bei ${width}`).toEqual([]);
      await page.locator("#narrationEmail").fill("oma@example.test");
      await page.locator("#narrationPhone").fill("0171 1234567");
      await page.getByLabel(/Ich bestätige/).check();
      await weiter(page);
      expect(await page.evaluate(auditCard), `Zugang bei ${width}`).toEqual([]);
      await weiter(page);
      expect(await page.evaluate(auditCard), `Kauf bei ${width}`).toEqual([]);
      // Der Zwischenspeicher würde sonst beim nächsten Durchgang wieder hier starten.
      await page.evaluate(() => window.sessionStorage.clear());
    }
  });
});

test.describe("PROJ-24 — Onboarding angemeldet", () => {
  test.use({ storageState: "tests/.auth/user.json" });

  test("AC-14: Die eigene Adresse ist vorbefüllt", async ({ page }) => {
    await toNarration(page, "self");
    await expect(page.locator("#narrationEmail")).toHaveValue("qa-test@narravit.de");
  });

  test("AC-26: Fremder Zwischenspeicher wird nicht gezeigt", async ({ page }) => {
    await page.goto("/onboarding");
    await page.evaluate(() => {
      window.sessionStorage.setItem(
        "narravit.onboarding.v1",
        JSON.stringify({
          ownerId: "00000000-0000-4000-8000-000000000000",
          savedAt: Date.now(),
          stepId: "purchase",
          state: {
            fullName: "Fremde Person",
            forWhom: "self",
            giftRecipientName: "",
            giftMode: null,
            giftRecipientEmail: "",
            giftRecipientRole: "co_author",
            buyerWantsAccess: true,
            narrationEnabled: true,
            narrationChannel: "email",
            narrationEmail: "fremd@example.test",
            narrationPhoneCountry: "DE",
            narrationPhone: "",
            narrationConsent: false,
          },
        }),
      );
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Für wen ist das Lebensbuch?" })).toBeVisible();
    await expect(page.getByText("Fremde Person")).toHaveCount(0);
  });
});
