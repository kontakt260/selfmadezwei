import { test, expect, type APIRequestContext } from "@playwright/test";

const QA_EMAIL = "qa-test@narravit.de";
const QA_PASSWORD = "QA-Test-2026!";

// PROJ-6 — Stripe-Zahlungen (Portal). Vapi-Paket zurückgebaut 2026-10-13.
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

// ─── Kauf ohne Konto (Checkout vor Login/Registrierung, 2026-11-16) ────────

test.describe("PROJ-6 — Kauf ohne Konto", () => {
  test("AC-Guest-1: /onboarding ist ohne Anmeldung erreichbar (kein Umweg über die Registrierung)", async ({
    page,
    context,
  }) => {
    // Frischer Context ohne Auth-Storage (storageState NICHT gesetzt).
    await context.clearCookies();
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(
      page.getByRole("heading", { name: "Für wen ist das Lebensbuch?" }),
    ).toBeVisible();
    // Wer schon ein Konto hat, kann sich von hier aus anmelden.
    await expect(page.getByRole("link", { name: "Anmelden" })).toHaveAttribute(
      "href",
      "/anmelden?next=%2Fonboarding",
    );
  });

  test("AC-Guest-2: Gast kommt bis zum Kauf-Schritt und erfährt, dass das Konto danach angelegt wird", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto("/onboarding");
    await page.getByRole("button", { name: /Für mich selbst/ }).click();
    await page.getByRole("button", { name: "Weiter" }).click();
    await page.getByLabel("Vor- und Nachnamen").fill("Gerda Gast");
    await page.getByRole("button", { name: "Weiter" }).click();

    await expect(page.getByRole("heading", { name: "Bereit zum Start?" })).toBeVisible();
    await expect(
      page.getByText(/Nach der Zahlung legen Sie in einem kurzen Schritt Ihr Konto an/),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Jetzt kaufen — 249 €/ })).toBeEnabled();
  });

  test("AC-Guest-3: /kauf-einloesen verlangt eine Anmeldung und merkt sich das Ziel", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto("/kauf-einloesen");
    await expect(page).toHaveURL(/\/anmelden\?next=%2Fkauf-einloesen$/);
  });

  test("AC-Link-1: Link aus der Kauf-Mail führt zur Anmeldung, das Geheimnis liegt im httpOnly-Cookie", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    const code = "A".repeat(43);
    await page.goto(`/kauf-zuordnen?code=${code}&ziel=anmelden`);
    await expect(page).toHaveURL(/\/anmelden\?next=%2Fkauf-einloesen$/);
    expect(page.url()).not.toContain(code);
    const cookie = (await context.cookies("http://localhost:3000/kauf-einloesen")).find(
      (c) => c.name === "nv_kauf_link",
    );
    expect(cookie?.value).toBe(code);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe("/kauf-einloesen");
    expect(await page.evaluate(() => document.cookie)).not.toContain(code);
  });

  // Regression Live-Test 4b (2026-11-21): Die Anmeldung läuft als Server
  // Action auf /anmelden. Das Geheimnis muss diesen Weg überstehen.
  test("AC-Link-3: Mail-Link, dann Anmeldung über das Formular: Einlösen sieht das Geheimnis", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto(`/kauf-zuordnen?code=${"C".repeat(43)}&ziel=anmelden`);
    await page.locator('input[name="email"]').fill(QA_EMAIL);
    await page.locator('input[name="password"]').fill(QA_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText(/bereits einem Konto zugeordnet/)).toBeVisible({ timeout: 20_000 });
    const cookies = await context.cookies("http://localhost:3000/kauf-einloesen");
    expect(cookies.find((c) => c.name === "nv_kauf_link")).toBeUndefined();
  });

  test("AC-Guest-4: /kauf-erfolgreich ist öffentlich, zeigt ohne gültige Stripe-Session aber nichts", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto("/kauf-erfolgreich?session_id=cs_test_invalid_xyz_does_not_exist");
    await expect(page).not.toHaveURL(/kauf-erfolgreich/);
  });
});

test.describe("PROJ-11 — Cron-Route", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // Regression 2026-11-21: Die Middleware leitete den Cron auf /anmelden um,
  // Erinnerungsmails wären nie verschickt worden.
  test("AC-Cron-1: wird nicht zur Anmeldung umgeleitet und verlangt das Secret", async ({ request }) => {
    const res = await request.get("/api/cron/reminders", {
      maxRedirects: 0,
      headers: { authorization: "Bearer falsches-secret" },
    });
    expect([401, 500]).toContain(res.status());
    expect(res.headers()["location"]).toBeUndefined();
  });
});

test.describe("PROJ-6 — Kauf einlösen (angemeldet)", () => {
  test.use({ storageState: "tests/.auth/user.json" });

  test("AC-Claim-1: ohne offenen Kauf führt /kauf-einloesen ein Konto mit Projekt zur Startseite", async ({
    page,
  }) => {
    await page.goto("/kauf-einloesen");
    await expect(page).toHaveURL(/localhost:3000\/$/);
  });

  test("AC-Link-2: unbekannter Link aus der Mail ordnet nichts zu und zeigt einen Hinweis", async ({
    page,
    context,
  }) => {
    await page.goto(`/kauf-zuordnen?code=${"B".repeat(43)}&ziel=anmelden`);
    await expect(page.getByText(/bereits einem Konto zugeordnet/)).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/localhost:3000\/$/);
    const cookies = await context.cookies("http://localhost:3000/kauf-einloesen");
    expect(cookies.find((c) => c.name === "nv_kauf_link")).toBeUndefined();
  });

  test("AC-Claim-3: `next` leitet nie auf eine fremde Seite (kein Open Redirect)", async ({
    page,
  }) => {
    // `/\\host` liest der URL-Parser wie `//host` — beides muss abgewiesen werden.
    for (const next of ["%2F%5Cevil.example", "%2F%2Fevil.example", "https%3A%2F%2Fevil.example"]) {
      await page.goto(`/anmelden?next=${next}`);
      await expect(page, next).toHaveURL(/^http:\/\/localhost:3000\//);
    }
  });

  test("AC-Claim-2: angemeldet auf /anmelden?next=/kauf-einloesen → kein erneutes Anmelden nötig", async ({
    page,
  }) => {
    await page.goto("/anmelden?next=%2Fkauf-einloesen");
    // Middleware leitet zum Ziel, /kauf-einloesen findet nichts → Startseite.
    await expect(page).toHaveURL(/localhost:3000\/$/);
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

  test("AC-Stats-1: Projektübersicht zeigt keine Telefonzeit-Stat und keinen Nachkauf-Button mehr", async ({
    page,
  }) => {
    await page.goto(QA_PROJECT_URL);
    await expect(
      page.getByText(/NARRAVIT-Projektzugang endet/i),
    ).toBeVisible();
    await expect(page.getByText("Telefonzeit übrig")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /60 Minuten nachkaufen/ }),
    ).toHaveCount(0);
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
