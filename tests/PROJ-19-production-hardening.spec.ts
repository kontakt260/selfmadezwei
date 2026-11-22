import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { waitForEditorReady } from "./helpers/editor-audit";
import { QA_PROJECT_ID, deleteQaChapters } from "./helpers/qa-project";

// PROJ-19 — Sicherheits-Header und Beobachtung der Content-Security-Policy.

const PUBLIC_PATHS = ["/anmelden", "/registrieren", "/passwort-vergessen", "/onboarding"];
const UPLOAD_CHAPTER = "PROJ-19 CSP-Testkapitel";

function expectCoreHeaders(headers: Record<string, string>, label: string) {
  expect(headers["x-frame-options"], label).toBe("DENY");
  expect(headers["x-content-type-options"], label).toBe("nosniff");
  expect(headers["referrer-policy"], label).toBe("origin-when-cross-origin");
  expect(headers["content-security-policy"], label).toContain("frame-ancestors 'none'");
  expect(headers["x-powered-by"], label).toBeUndefined();
}

function collectCspViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (/Content Security Policy|Content-Security-Policy/i.test(text)) violations.push(text);
  });
  return violations;
}

test.describe("PROJ-19 — Sicherheits-Header", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const path of PUBLIC_PATHS) {
    test(`Header sind auf ${path} gesetzt`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      const headers = response.headers();

      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["referrer-policy"]).toBe("origin-when-cross-origin");
      expect(headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
      expect(headers["content-security-policy"]).toBe(
        "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
      );
      expect(headers["content-security-policy-report-only"]).toContain(
        "https://challenges.cloudflare.com",
      );
      expect(headers["x-powered-by"]).toBeUndefined();
    });
  }

  test("Header gelten für jede Art von Antwort", async ({ request }) => {
    const html = await (await request.get("/anmelden")).text();
    const asset = html.match(/\/_next\/static\/[^"'\\]+\.(?:js|css)/)?.[0];
    expect(asset).toBeDefined();

    for (const [label, target] of [
      ["404-Seite", "/gibt-es-nicht"],
      ["Weiterleitung der Middleware", "/"],
      ["Auth-Callback", "/auth/callback"],
      ["API-Route", "/api/cron/reminders"],
      ["Einladungsseite", "/einladung/ungueltiges-token-1234567890"],
      ["Statische Datei", asset as string],
    ] as const) {
      const response = await request.get(target, { maxRedirects: 0 });
      expectCoreHeaders(response.headers(), label);
    }
  });

  test("Fremde Seiten sehen keine Pfade mit Einladungs-Token", async ({ page, baseURL }) => {
    const token = "geheimes-token-1234567890abcdef";
    let referer: string | undefined;
    await page.route("https://fremde-seite.example/pixel", async (route) => {
      referer = (await route.request().allHeaders()).referer;
      await route.fulfill({
        status: 200,
        headers: { "access-control-allow-origin": "*" },
        body: "ok",
      });
    });

    await page.goto(`/einladung/${token}`);
    await page.evaluate(() => fetch("https://fremde-seite.example/pixel").then((r) => r.text()));

    expect(referer).toBe(`${baseURL}/`);
  });

  test("Eingeschleuste Basis-Adresse und Plugins werden blockiert", async ({ page }) => {
    await page.goto("/anmelden");
    const result = await page.evaluate(async () => {
      const blocked: string[] = [];
      document.addEventListener("securitypolicyviolation", (event) => {
        if (event.disposition === "enforce") blocked.push(event.effectiveDirective);
      });
      const base = document.createElement("base");
      base.href = "https://boese.example/";
      document.head.prepend(base);
      const plugin = document.createElement("object");
      plugin.data = "https://boese.example/plugin";
      document.body.append(plugin);
      await new Promise((resolve) => setTimeout(resolve, 400));
      const baseURI = document.baseURI;
      base.remove();
      plugin.remove();
      return { baseURI, blocked };
    });

    expect(result.baseURI).not.toContain("boese.example");
    expect(result.blocked).toEqual(expect.arrayContaining(["base-uri", "object-src"]));
  });

  for (const [label, provider] of [
    ["Google", "google"],
    ["Facebook", "facebook"],
  ] as const) {
    test(`${label}-Anmeldung startet ohne CSP-Meldung`, async ({ page }) => {
      const violations = collectCspViolations(page);
      let authorizeUrl = "";
      // Endet hier: Es wird keine echte Anmeldung ausgelöst.
      await page.route("**/auth/v1/authorize**", async (route) => {
        authorizeUrl = route.request().url();
        await route.fulfill({ contentType: "text/html", body: "<p>Testende</p>" });
      });

      await page.goto("/anmelden");
      await page.getByRole("button", { name: `Mit ${label} anmelden` }).click();

      await expect.poll(() => authorizeUrl, { timeout: 15_000 }).toContain(`provider=${provider}`);
      expect(new URL(authorizeUrl).searchParams.get("redirect_to")).toContain("/auth/callback");
      expect(violations).toEqual([]);
    });
  }

  test("Weiterleitung zum Stripe-Checkout wird nicht blockiert", async ({ page }) => {
    const violations = collectCspViolations(page);
    const checkoutUrl = "https://checkout.stripe.com/c/pay/cs_test_e2e";
    await page.route(checkoutUrl, (route) =>
      route.fulfill({ contentType: "text/html", body: "<p>Testende</p>" }),
    );

    await page.goto("/anmelden");
    await page.evaluate((url) => {
      window.location.href = url;
    }, checkoutUrl);

    await page.waitForURL(checkoutUrl);
    expect(violations).toEqual([]);
  });

  test("Auf localhost wird HTTPS nicht erzwungen", async ({ request }) => {
    const response = await request.get("/anmelden");
    expect(response.headers()["strict-transport-security"]).toBeUndefined();
  });

  test("Die App lässt sich nicht in eine fremde Seite einbetten", async ({ page, baseURL }) => {
    await page.route("https://fremde-seite.example/", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><iframe id="app" src="${baseURL}/anmelden"></iframe>`,
      }),
    );
    await page.goto("https://fremde-seite.example/");
    await page.waitForTimeout(1500);

    const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
    const fields = frame ? await frame.locator('input[name="email"]').count() : 0;
    expect(fields).toBe(0);
  });

  test("Anmeldung mit Sicherheitsprüfung läuft ohne CSP-Meldung", async ({ page }) => {
    const violations = collectCspViolations(page);
    await page.goto("/anmelden");
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null)
                ?.value.length ?? 0,
          ),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });
});

test.describe("PROJ-19 — CSP in den wichtigen Abläufen", () => {
  test.use({ storageState: "tests/.auth/user.json" });
  test.setTimeout(90_000);

  test("Bild-Upload mit Vorschau läuft ohne CSP-Meldung", async ({ page }) => {
    test.setTimeout(120_000);
    const dir = path.join(tmpdir(), "narravit-e2e-bilder");
    mkdirSync(dir, { recursive: true });
    const image = path.join(dir, "proj19-klein.jpg");
    await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 150, g: 180, b: 150 } },
    })
      .jpeg()
      .toFile(image);

    const violations = collectCspViolations(page);
    await deleteQaChapters(page, UPLOAD_CHAPTER);
    try {
      await page.goto(`/projektuebersicht/${QA_PROJECT_ID}`);
      await page.locator("button", { hasText: "Eigenes Kapitel" }).first().click();
      await page.getByPlaceholder("z. B. Reisen und Begegnungen").fill(UPLOAD_CHAPTER);
      await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
      await page.waitForURL(/kapiteleditor/, { timeout: 15_000 });
      await waitForEditorReady(page);

      await page.getByRole("button", { name: "Bild hinzufügen" }).first().click();
      await page.locator('input[type="file"]').setInputFiles(image);
      await page.getByRole("button", { name: "Übernehmen" }).click();
      await expect(page.locator('img[src*="chapter-heroes"]').first()).toBeVisible({
        timeout: 45_000,
      });

      expect(violations).toEqual([]);
    } finally {
      await deleteQaChapters(page, UPLOAD_CHAPTER);
    }
  });

  test("Angemeldete Seiten laufen ohne CSP-Meldung", async ({ page }) => {
    const violations = collectCspViolations(page);

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.goto(`/projektuebersicht/${QA_PROJECT_ID}`);
    await page.waitForLoadState("networkidle");

    const chapterLink = page.locator(`a[href*="/projektuebersicht/${QA_PROJECT_ID}/kapiteleditor/"]`).first();
    if ((await chapterLink.count()) > 0) {
      await page.goto((await chapterLink.getAttribute("href")) as string);
      await expect(page.locator(".ProseMirror").first()).toBeVisible({ timeout: 30_000 });
    }

    await page.goto(`/projektuebersicht/${QA_PROJECT_ID}/cover-bearbeiten`);
    await page.waitForLoadState("networkidle");
    await page.goto("/persoenlicher-bereich");
    await expect(page.locator("#account-email")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2_000);

    expect(violations).toEqual([]);
  });
});
