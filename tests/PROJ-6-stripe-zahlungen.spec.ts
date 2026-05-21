import { test, expect, type APIRequestContext } from "@playwright/test";

// PROJ-6 — Stripe-Zahlungen (Portal + Vapi-Paket).
//
// Diese E2E-Suite deckt die acceptance criteria ab, die nicht schon
// von der Vitest-Suite (`src/app/api/stripe/webhook/route.test.ts`,
// 8 Tests: Signatur, Idempotenz, 3 Geschenk-Varianten, GREATEST-Trick,
// Vapi-Top-up) abgedeckt sind. Hier laufen die HTTP-/Browser-orientierten
// Tests: Webhook-Reachability, Auth-Gate, Erfolgsseiten-Verifikation,
// Cancel-Toast, Stats-Cards. Der vollständige Stripe-Roundtrip (real
// gegen Test-Mode) liegt außerhalb der E2E-Suite — er wurde im Browser
// gegen stage-app.narravit.de manuell ausgeführt und in der DB
// (`payments`, `project_access`, `project_members`) verifiziert
// (siehe QA-Sektion im Feature-Spec).

// ─── Webhook-Sicherheit (HTTP-Ebene) ───────────────────────────────────────

test.describe("PROJ-6 — Webhook (HTTP)", () => {
  test("AC-Webhook-1: POST ohne stripe-signature Header → 400", async ({
    request,
  }) => {
    const res = await request.post("/api/stripe/webhook", {
      data: "{}",
      headers: { "content-type": "application/json" },
    });
    expect(res.status()).toBe(400);
    expect(await res.text()).toMatch(/Missing signature header/i);
  });

  test("AC-Webhook-2: POST mit ungültiger Signatur → 400", async ({
    request,
  }) => {
    const res = await request.post("/api/stripe/webhook", {
      data: '{"hello":"world"}',
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=123,v1=bogus",
      },
    });
    expect(res.status()).toBe(400);
    expect(await res.text()).toMatch(/Invalid signature/i);
  });

  test("AC-Webhook-3: Endpoint ist von Middleware ausgenommen — keine 302 für unsignierte Requests", async ({
    request,
  }) => {
    // Wenn die Middleware den Webhook NICHT ausnehmen würde, würde sie
    // anonyme POSTs zur Auth-Seite umleiten und Stripe stattdessen einen
    // 302/307 bekommen — Stripe würde die Signatur-Prüfung gar nicht
    // erst erreichen.
    const res = await request.post("/api/stripe/webhook", {
      data: "{}",
      headers: { "content-type": "application/json" },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(400);
  });
});

// ─── Onboarding-Auth-Gate ──────────────────────────────────────────────────

test.describe("PROJ-6 — Onboarding-Gating", () => {
  test("AC-Auth-1: Anonymer Aufruf von /onboarding → Redirect auf /registrieren?next=/onboarding", async ({
    page,
    context,
  }) => {
    // Frischer Context ohne Auth-Storage (storageState NICHT gesetzt).
    await context.clearCookies();
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/registrieren\?next=%2Fonboarding/);
  });
});

// ─── Erfolgsseite — serverseitige Session-Verifikation ─────────────────────

test.describe("PROJ-6 — /kauf-erfolgreich", () => {
  test("AC-Success-1: Aufruf ohne session_id → Redirect auf /", async ({
    page,
  }) => {
    await page.goto("/kauf-erfolgreich");
    // Middleware schickt nicht-eingeloggte User von / weiter zu /anmelden.
    // Wir akzeptieren beides — Hauptsache wir landen NICHT auf /kauf-erfolgreich.
    await expect(page).not.toHaveURL(/kauf-erfolgreich/);
  });

  test("AC-Success-2: Aufruf mit ungültiger session_id → Redirect auf /", async ({
    page,
  }) => {
    await page.goto("/kauf-erfolgreich?session_id=cs_test_invalid_xyz_does_not_exist");
    await expect(page).not.toHaveURL(/kauf-erfolgreich/);
  });
});

// ─── Cancel-Toast ──────────────────────────────────────────────────────────

test.describe("PROJ-6 — Cancel-Toast", () => {
  test.use({ storageState: "tests/.auth/user.json" });

  test("AC-Cancel-1: /onboarding?checkout=cancelled zeigt Toast", async ({
    page,
  }) => {
    await page.goto("/onboarding?checkout=cancelled");
    // Sonner-Toast erscheint kurz nach Mount — wir warten auf den Text.
    await expect(
      page.getByText(/Kauf nicht abgeschlossen/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ─── Paywall-Stat-Cards in der Projektübersicht ────────────────────────────

test.describe("PROJ-6 — Stat-Cards", () => {
  test.use({ storageState: "tests/.auth/user.json" });

  // Stage-DB-Seed (QA-Testprojekt, siehe PROJ-4 spec).
  const QA_PROJECT_URL =
    "/projektuebersicht/cccccccc-0099-0099-0099-000000000099";

  test("AC-Stats-1: Projektübersicht zeigt Telefonzeit-Stat + Nachkauf-Button", async ({
    page,
  }) => {
    await page.goto(QA_PROJECT_URL);
    await expect(page.getByText("Telefonzeit übrig")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /60 Minuten nachkaufen/ }),
    ).toBeVisible();
  });

  test("AC-Stats-2: Projektübersicht zeigt Zugang-endet-in-Stat + Verlängern-Button", async ({
    page,
  }) => {
    await page.goto(QA_PROJECT_URL);
    await expect(
      page.getByText(/NARRAVIT-Projektzugang endet/i),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /verlängern/i }),
    ).toBeVisible();
  });
});

// ─── Webhook-Reachability gegen Live-Stage ────────────────────────────────
//
// Optionaler Smoke-Test: bestätigt, dass die deployte Webhook-Route auf
// stage-app.narravit.de erreichbar ist und bei fehlender Signatur sauber
// mit 400 antwortet (statt 401/302/500). Läuft nur, wenn
// `PLAYWRIGHT_STAGE_WEBHOOK_URL` gesetzt ist — sonst skipped (CI-freundlich).

const STAGE_WEBHOOK_URL = process.env.PLAYWRIGHT_STAGE_WEBHOOK_URL;

test.describe("PROJ-6 — Stage-Smoke", () => {
  test.skip(
    !STAGE_WEBHOOK_URL,
    "PLAYWRIGHT_STAGE_WEBHOOK_URL nicht gesetzt — Smoke-Test übersprungen",
  );

  test("AC-Stage-1: Stage-Webhook ist erreichbar (400 bei fehlender Signatur)", async ({
    request,
  }) => {
    const res = await postRaw(request, STAGE_WEBHOOK_URL!, "{}");
    expect(res.status).toBe(400);
  });
});

async function postRaw(
  request: APIRequestContext,
  url: string,
  body: string,
): Promise<{ status: number; text: string }> {
  const res = await request.post(url, {
    data: body,
    headers: { "content-type": "application/json" },
    maxRedirects: 0,
  });
  return { status: res.status(), text: await res.text() };
}
