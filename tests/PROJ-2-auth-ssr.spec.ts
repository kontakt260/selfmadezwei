import { test, expect } from "@playwright/test";

// PROJ-2: Auth + SSR — E2E tests for unauthenticated (no real Supabase user) flows.
// Tests that require an actual Supabase session (full login, OAuth, reset) are documented
// but not exercised here — they need a real test user and provider config.

test.describe("PROJ-2 — Public auth pages render", () => {
  test("/anmelden shows login form with all required fields", async ({ page }) => {
    await page.goto("/anmelden");
    await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.getByRole("link", { name: "Passwort vergessen?" })).toBeVisible();
    // Aktive OAuth-Provider: Google + Facebook. Apple ist archiviert
    // (siehe src/components/auth/OAuthButtons.tsx), bis die Apple-Developer-
    // Konfiguration steht — Spec PROJ-3 Refine 2026-05-21.
    await expect(page.getByRole("button", { name: /Mit Google anmelden/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Mit Facebook anmelden/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Mit Apple anmelden/ })).toHaveCount(0);
  });

  test("/registrieren shows register form with all required fields", async ({ page }) => {
    await page.goto("/registrieren");
    await expect(page.getByRole("heading", { name: "Konto erstellen" })).toBeVisible();
    await expect(page.locator('input[name="fullName"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('input[name="confirmPassword"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /Mit Google registrieren/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Mit Facebook registrieren/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Mit Apple registrieren/ })).toHaveCount(0);
  });

  test("/email-bestaetigen shows confirmation hint", async ({ page }) => {
    await page.goto("/email-bestaetigen");
    await expect(page.getByRole("heading", { name: /Prüfe deine E-Mail/ })).toBeVisible();
  });

  test("/passwort-vergessen shows email input", async ({ page }) => {
    await page.goto("/passwort-vergessen");
    await expect(page.getByRole("heading", { name: /Passwort vergessen/ })).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });

  test("/passwort-zuruecksetzen shows two password fields", async ({ page }) => {
    await page.goto("/passwort-zuruecksetzen");
    await expect(page.getByRole("heading", { name: "Neues Passwort" })).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('input[name="confirmPassword"]')).toBeVisible();
  });

  test("/zugang-abgelaufen shows renewal CTA + sign out", async ({ page }) => {
    await page.goto("/zugang-abgelaufen");
    await expect(page.getByRole("heading", { name: /abgelaufen/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Zugang verlängern/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Abmelden" })).toBeVisible();
  });
});

test.describe("PROJ-2 — Middleware route protection", () => {
  test("unauthenticated user is redirected from / to /anmelden", async ({ page }) => {
    const response = await page.goto("/");
    await expect(page).toHaveURL(/\/anmelden$/);
    expect(response?.status()).toBeLessThan(400);
  });

  test("unauthenticated user is redirected from arbitrary protected path", async ({ page }) => {
    await page.goto("/projektuebersicht");
    await expect(page).toHaveURL(/\/anmelden$/);
  });

  test("public auth pages stay accessible without auth", async ({ page }) => {
    await page.goto("/anmelden");
    await expect(page).toHaveURL(/\/anmelden$/);
    await page.goto("/registrieren");
    await expect(page).toHaveURL(/\/registrieren$/);
  });
});

test.describe("PROJ-2 — Form validation (Zod, server actions)", () => {
  test("login with empty email shows validation error", async ({ page }) => {
    await page.goto("/anmelden");
    await page.locator('input[name="password"]').fill("anything");
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(page.getByText(/gültige E-Mail/)).toBeVisible();
  });

  test("login with bogus credentials shows generic error (no enumeration)", async ({ page }) => {
    await page.goto("/anmelden");
    await page.locator('input[name="email"]').fill("not-a-real-user@example.com");
    await page.locator('input[name="password"]').fill("wrongpassword");
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(page.getByText(/E-Mail oder Passwort falsch/)).toBeVisible();
    await expect(page.getByText(/existiert nicht/)).toHaveCount(0);
  });

  test("register with mismatched passwords shows error", async ({ page }) => {
    await page.goto("/registrieren");
    await page.locator('input[name="fullName"]').fill("Test User");
    await page.locator('input[name="email"]').fill("test@example.com");
    await page.locator('input[name="password"]').fill("password123");
    await page.locator('input[name="confirmPassword"]').fill("password456");
    await page.getByRole("button", { name: "Konto erstellen" }).click();
    await expect(page.getByText(/stimmen nicht überein/)).toBeVisible();
  });

  test("register with short password shows error", async ({ page }) => {
    await page.goto("/registrieren");
    await page.locator('input[name="fullName"]').fill("Test User");
    await page.locator('input[name="email"]').fill("test@example.com");
    await page.locator('input[name="password"]').fill("short");
    await page.locator('input[name="confirmPassword"]').fill("short");
    await page.getByRole("button", { name: "Konto erstellen" }).click();
    await expect(page.getByText(/Mindestens 8 Zeichen/)).toBeVisible();
  });

  test("register with too-short name shows error", async ({ page }) => {
    await page.goto("/registrieren");
    await page.locator('input[name="fullName"]').fill("A");
    await page.locator('input[name="email"]').fill("test@example.com");
    await page.locator('input[name="password"]').fill("password123");
    await page.locator('input[name="confirmPassword"]').fill("password123");
    await page.getByRole("button", { name: "Konto erstellen" }).click();
    await expect(page.getByText(/vollständigen Namen/)).toBeVisible();
  });

  test("forgot-password always shows generic success (no enumeration)", async ({ page }) => {
    await page.goto("/passwort-vergessen");
    await page.locator('input[name="email"]').fill("does-not-exist@example.com");
    await page.getByRole("button", { name: /Reset-Link senden/ }).click();
    await expect(page.getByText(/Falls ein Konto mit dieser E-Mail existiert/)).toBeVisible();
  });
});

test.describe("PROJ-2 — Onboarding wizard", () => {
  // Seit PROJ-6 ist /onboarding auth-gated — anonyme Aufrufe werden auf
  // /registrieren?next=/onboarding umgeleitet. Wir laden hier den
  // qa-test-User-State, damit der Wizard tatsächlich rendert.
  test.use({ storageState: "tests/.auth/user.json" });

  // Serial: /onboarding makes a Supabase auth call on every request; concurrent hits
  // against the dev server's Turbopack compiler exceed the 30s timeout.
  test.describe.configure({ mode: "serial" });

  // Step order after commit 535f502 ("change onboarding order for better flow"):
  // for-whom → name → [gift-details] → [gift-computer] → purchase
  // Path A (self):              for-whom → name → purchase            (3 steps)
  // Path B1 (gift+phone-only):  for-whom → name → gift-details → purchase  (4 steps)
  // Path B2 (gift+computer):    for-whom → name → gift-details → gift-computer → purchase (5 steps)

  test("Path A (self): for-whom → name → purchase (3 steps)", async ({ page }) => {
    await page.goto("/onboarding");

    // Step 1: For whom?
    await page.getByRole("button", { name: /Für mich selbst/ }).click();
    await page.getByRole("button", { name: "Weiter" }).click();

    // Step 2: Name
    await page.locator('input[id="fullName"]').fill("Max Mustermann");
    await page.getByRole("button", { name: "Weiter" }).click();

    // Step 3: Purchase CTA
    await expect(page.getByRole("heading", { name: /Bereit zum Start/ })).toBeVisible();
    await expect(page.getByText("Max Mustermann")).toBeVisible();
    await expect(page.getByText("Für mich selbst")).toBeVisible();
    await expect(page.getByRole("button", { name: /Jetzt kaufen/ })).toBeVisible();
  });

  test("Path B1 (gift + phone-only): 4 steps", async ({ page }) => {
    await page.goto("/onboarding");

    // Step 1: For whom?
    await page.getByRole("button", { name: /Als Geschenk/ }).click();
    await page.getByRole("button", { name: "Weiter" }).click();

    // Step 2: Name
    await page.locator('input[id="fullName"]').fill("Max Mustermann");
    await page.getByRole("button", { name: "Weiter" }).click();

    // Step 3: Gift details
    await page.locator('input[id="recipientName"]').fill("Oma Helga");
    await page.getByRole("button", { name: /Nur per Telefon erzählen/ }).click();

    // Hint about Projektleiter must appear
    await expect(page.getByText(/vollen Zugriff auf das Projekt/)).toBeVisible();
    await page.getByRole("button", { name: "Weiter" }).click();

    // Step 4: Purchase step shows gift summary
    await expect(page.getByText("Oma Helga")).toBeVisible();
    await expect(page.getByText("Nur Telefon")).toBeVisible();
  });

  test("Path B2 (gift + phone+computer): 5 steps with role selection", async ({ page }) => {
    await page.goto("/onboarding");

    // Step 1: For whom?
    await page.getByRole("button", { name: /Als Geschenk/ }).click();
    await page.getByRole("button", { name: "Weiter" }).click();

    // Step 2: Name
    await page.locator('input[id="fullName"]').fill("Max Mustermann");
    await page.getByRole("button", { name: "Weiter" }).click();

    // Step 3: Gift details
    await page.locator('input[id="recipientName"]').fill("Oma Helga");
    await page.getByRole("button", { name: /Auch am Computer schreiben/ }).click();
    await page.getByRole("button", { name: "Weiter" }).click();

    // Step 4: Gift computer — email + role + buyer-access toggle
    await page.locator('input[id="recipientEmail"]').fill("oma@example.com");
    await page.getByRole("button", { name: /^Projektleiter/ }).first().click();
    await page.getByRole("button", { name: "Weiter" }).click();

    // Step 5: Purchase step
    await expect(page.getByText("oma@example.com")).toBeVisible();
    await expect(page.getByText("Auch Computer")).toBeVisible();
  });

  test("name step requires min. 2 characters", async ({ page }) => {
    await page.goto("/onboarding");
    // Must pass for-whom first (step 1)
    await page.getByRole("button", { name: /Für mich selbst/ }).click();
    await page.getByRole("button", { name: "Weiter" }).click();
    // Now on name step (step 2)
    await page.locator('input[id="fullName"]').fill("A");
    await page.getByRole("button", { name: "Weiter" }).click();
    await expect(page.getByText(/mind. 2 Zeichen/)).toBeVisible();
  });

  test("for-whom step requires a choice", async ({ page }) => {
    await page.goto("/onboarding");
    // for-whom is now step 1 — click Weiter without selecting
    await page.getByRole("button", { name: "Weiter" }).click();
    await expect(page.getByText(/Bitte triff eine Auswahl/)).toBeVisible();
  });

  test("gift-computer step rejects invalid email", async ({ page }) => {
    await page.goto("/onboarding");

    await page.getByRole("button", { name: /Als Geschenk/ }).click();
    await page.getByRole("button", { name: "Weiter" }).click();

    await page.locator('input[id="fullName"]').fill("Max Mustermann");
    await page.getByRole("button", { name: "Weiter" }).click();

    await page.locator('input[id="recipientName"]').fill("Oma Helga");
    await page.getByRole("button", { name: /Auch am Computer schreiben/ }).click();
    await page.getByRole("button", { name: "Weiter" }).click();

    await page.locator('input[id="recipientEmail"]').fill("not-an-email");
    await page.getByRole("button", { name: "Weiter" }).click();
    await expect(page.getByText(/gültige E-Mail/)).toBeVisible();
  });

  test("back button returns to previous step and preserves state", async ({ page }) => {
    await page.goto("/onboarding");
    // Path A: for-whom → name → purchase
    await page.getByRole("button", { name: /Für mich selbst/ }).click();
    await page.getByRole("button", { name: "Weiter" }).click();
    await page.locator('input[id="fullName"]').fill("Max Mustermann");
    await page.getByRole("button", { name: "Weiter" }).click();

    // We're at purchase (step 3). Go back once → name step.
    await page.getByRole("button", { name: "Zurück" }).click();
    await expect(page.locator('input[id="fullName"]')).toHaveValue("Max Mustermann");

    // Go back again → for-whom step. State should be preserved (go forward to verify).
    await page.getByRole("button", { name: "Zurück" }).click();
    await expect(page.getByRole("button", { name: /Für mich selbst/ })).toBeVisible();
  });
});
