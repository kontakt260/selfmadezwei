import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { waitForPage } from "./helpers/page-ready";
import { createTestAccount, readEnvLocal, signIn, STAGE_HOST } from "./helpers/stage";

// PROJ-22 — Design-Grundlage im echten Browser gegen Stage.
//
// Die Suite legt temporäre Konten und Projekte an und läuft deshalb nur mit
// `E2E_DESIGN=1` und nur gegen Stage:
//
//   E2E_DESIGN=1 npx playwright test tests/PROJ-22-design-grundlage.spec.ts --project=chromium
//
// Das QA-Konto wird nicht angefasst, es werden keine Mails ausgelöst.

const ENABLED = process.env.E2E_DESIGN === "1";
const TEST_EMAIL_PREFIX = "e2e-design-";
const RUN_ID = crypto.randomBytes(4).toString("hex");
const DAY_MS = 86_400_000;
const WIDTHS = [1440, 768, 375] as const;

type Account = { id: string; email: string; password: string };
type Role = "projektleiter" | "co_author";
type TestProject = { id: string; title: string };

let admin: SupabaseClient;
let L: Account;
let C: Account;
let S: Account;
let N: Account;
let contextL: BrowserContext;
let contextS: BrowserContext;
let contextN: BrowserContext;
let pageL: Page;
let pageS: Page;
let pageN: Page;
let main: TestProject;
let shared: TestProject;
let expired: TestProject;
let empty: TestProject;

const accounts: Account[] = [];
const projectIds = new Set<string>();

async function createAccount(label: string): Promise<Account> {
  const account = await createTestAccount(admin, {
    email: `${TEST_EMAIL_PREFIX}${label}-${RUN_ID}@example.test`,
    name: `Test ${label}`,
  });
  accounts.push(account);
  return account;
}

async function createProject(input: {
  title: string;
  members: Array<[Account, Role]>;
  chapters: number;
  color: string;
  author?: string;
  expiredDays?: number;
}): Promise<TestProject> {
  const id = crypto.randomUUID();
  const title = `${input.title} ${RUN_ID}`;
  projectIds.add(id);
  const rows: Array<[string, object]> = [
    ["projects", { id, title, owner_id: input.members[0][0].id }],
    [
      "project_access",
      { project_id: id, expires_at: new Date(Date.now() + 100 * DAY_MS).toISOString() },
    ],
    [
      "project_covers",
      {
        project_id: id,
        metadata: { background_color: input.color, author_line: input.author ?? "" },
      },
    ],
  ];
  for (const [table, row] of rows) {
    const { error } = await admin.from(table).insert(row as never);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  for (const [member, role] of input.members) {
    const { error } = await admin
      .from("project_members")
      .insert({ project_id: id, user_id: member.id, role });
    if (error) throw new Error(error.message);
  }
  for (let index = 0; index < input.chapters; index += 1) {
    const { error } = await admin.from("chapters").insert({
      project_id: id,
      title: `Kapitel ${index + 1}`,
      sort_order: index,
      page_count: 3,
      body: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Eine Erinnerung" }] }],
      },
    });
    if (error) throw new Error(error.message);
  }
  if (input.expiredDays) {
    const { error } = await admin
      .from("project_access")
      .update({ expires_at: new Date(Date.now() - input.expiredDays * DAY_MS).toISOString() })
      .eq("project_id", id);
    if (error) throw new Error(error.message);
  }
  return { id, title };
}

/** Sucht in `main` nach zu kleiner Schrift, zu kleinen Buttons, Rundungen und Überlauf. */
const auditMain = () => {
  const root = document.querySelector("main")!;
  const visible = (el: Element) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };
  const decorative = (el: Element) => !!el.closest('[role="img"],[aria-hidden="true"],.sr-only');
  const clipped = (el: Element) => {
    let parent = el.parentElement;
    while (parent && parent !== document.body) {
      if (getComputedStyle(parent).overflowX !== "visible") return true;
      parent = parent.parentElement;
    }
    return false;
  };
  const problems: string[] = [];
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (!visible(el) || decorative(el)) continue;
    const style = getComputedStyle(el);
    const text = Array.from(el.childNodes)
      .filter((node) => node.nodeType === 3 && node.textContent!.trim())
      .map((node) => node.textContent!.trim())
      .join(" ");
    if (text && parseFloat(style.fontSize) < 16) problems.push(`klein: ${text.slice(0, 30)}`);
    if (el.matches("a,button,input,select,textarea") && !el.closest("p")) {
      if (el.getBoundingClientRect().height < 44) problems.push(`Button: ${text.slice(0, 30)}`);
    }
    if (parseFloat(style.borderTopLeftRadius) > 0) problems.push(`rund: ${el.tagName}`);
    const rect = el.getBoundingClientRect();
    if ((rect.right > innerWidth + 1 || rect.left < -1) && !clipped(el)) {
      problems.push(`außerhalb: ${el.tagName} ${text.slice(0, 24)}`);
    }
  }
  return Array.from(new Set(problems));
};

const fontOf = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        family: style.fontFamily.toLowerCase().replace(/_/g, " "),
        weight: style.fontWeight,
        // Der Browser meldet ohne Zeichenabstand den Wert „normal".
        spacing: (parseFloat(style.letterSpacing) || 0) / parseFloat(style.fontSize),
      };
    });

const card = (page: Page, title: string) => page.locator("main article", { hasText: title });

test.describe("PROJ-22 — Design-Grundlage (nur Stage)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!ENABLED, "Nur mit E2E_DESIGN=1, legt temporäre Stage-Konten an.");
  test.setTimeout(90_000);

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    const env = readEnvLocal();
    if (!env.NEXT_PUBLIC_SUPABASE_URL?.includes(STAGE_HOST)) {
      throw new Error("PROJ-22-Suite läuft nur gegen Stage.");
    }
    admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    L = await createAccount("leitung");
    C = await createAccount("co");
    S = await createAccount("einzeln");
    N = await createAccount("leer");

    empty = await createProject({
      title: "Ohne Kapitel",
      members: [[L, "projektleiter"]],
      chapters: 0,
      color: "bordeaux",
    });
    expired = await createProject({
      title: "Abgelaufen",
      members: [[L, "projektleiter"]],
      chapters: 2,
      color: "blau-grau",
      author: "Familie Muster",
      expiredDays: 3,
    });
    shared = await createProject({
      title: "Mitgeschrieben",
      members: [
        [C, "projektleiter"],
        [L, "co_author"],
      ],
      chapters: 2,
      color: "salbei",
    });
    main = await createProject({
      title: "Mein Lebensbuch",
      members: [
        [L, "projektleiter"],
        [C, "co_author"],
      ],
      chapters: 3,
      color: "sand",
      author: "Maria Muster",
    });
    await createProject({
      title: "Einziges Buch",
      members: [[S, "projektleiter"]],
      chapters: 1,
      color: "creme",
    });

    contextL = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    contextS = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    contextN = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    pageL = await contextL.newPage();
    pageS = await contextS.newPage();
    pageN = await contextN.newPage();
    await signIn(pageL, L);
    await signIn(pageS, S);
    await signIn(pageN, N);
  });

  test.afterAll(async () => {
    await contextL?.close();
    await contextS?.close();
    await contextN?.close();
    if (!admin) return;
    for (const id of projectIds) {
      await admin.from("storage_chapter_cleanup_queue").delete().eq("project_id", id);
      await admin.from("storage_cleanup_queue").delete().eq("project_id", id);
      await admin.from("projects").delete().eq("id", id);
    }
    for (const account of accounts) {
      if (!account.email.startsWith(TEST_EMAIL_PREFIX) || !account.email.includes(RUN_ID)) continue;
      await admin.auth.admin.deleteUser(account.id);
    }
  });

  test("AC-1, AC-2, AC-38: PT Serif mit Zeichenabstand, Markenname in Merriweather", async () => {
    await pageL.goto("/");
    const h1 = await fontOf(pageL, "main h1");
    expect(h1.family).toContain("pt serif");
    expect(h1.weight).toBe("400");
    expect(h1.spacing).toBeCloseTo(-0.02, 3);
    const h2 = await fontOf(pageL, "main h2");
    expect(h2.family).toContain("pt serif");
    expect(h2.spacing).toBeCloseTo(-0.01, 3);
    const brand = await fontOf(pageL, "main h1 span");
    expect(brand.family).toContain("merriweather");
    expect(brand.spacing).toBe(0);
  });

  test("AC-3: Der Buchsatz im Editor behält Merriweather ohne Zeichenabstand", async () => {
    const { data } = await admin
      .from("chapters")
      .select("id")
      .eq("project_id", main.id)
      .order("sort_order")
      .limit(1)
      .single();
    await pageL.goto(`/projektuebersicht/${main.id}/kapiteleditor/${data!.id}`);
    await pageL.locator(".a5-stack h1").first().waitFor();
    const title = await fontOf(pageL, ".a5-stack h1");
    expect(title.family).toContain("merriweather");
    expect(title.spacing).toBe(0);
  });

  test("AC-5, AC-6, AC-8, AC-35: Drei Seiten sind lesbar und laufen nicht über", async () => {
    for (const url of ["/", `/projektuebersicht/${main.id}`, "/persoenlicher-bereich"]) {
      for (const width of WIDTHS) {
        await pageL.setViewportSize({ width, height: 900 });
        await pageL.goto(url);
        await pageL.locator("main h1").first().waitFor();
        expect(await pageL.evaluate(auditMain), `${url} bei ${width} px`).toEqual([]);
      }
    }
    await pageL.setViewportSize({ width: 1440, height: 1000 });
  });

  test("AC-10, AC-11, AC-14: Ein Projekt zeigt die große Karte", async () => {
    await pageS.goto("/");
    await expect(
      pageS.getByRole("heading", { name: "Willkommen zurück bei NARRAVIT" }),
    ).toBeVisible();
    await expect(
      pageS.getByText("Schön, dass Sie sich die Zeit nehmen, um weitere Geschichten festzuhalten."),
    ).toBeVisible();
    const article = pageS.locator("main article");
    await expect(article).toHaveCount(1);
    await expect(article).toContainText("Ihr Projekt");
    await expect(article).toContainText("1 Kapitel");
    await expect(article).toContainText("Zuletzt bearbeitet: heute");
    await expect(article.getByRole("link", { name: "Weiterschreiben" })).toBeVisible();
  });

  test("AC-12, AC-13: Mehrere Projekte stehen nach letzter Bearbeitung", async () => {
    await pageL.goto("/");
    await expect(pageL.getByRole("heading", { name: "Ihre Bücher" })).toBeVisible();
    const cards = pageL.locator("main article");
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0)).toContainText(main.title);
    await expect(cards.nth(0)).toContainText("Sie leiten dieses Buch");
    await expect(cards.nth(1)).toContainText(shared.title);
    await expect(cards.nth(1)).toContainText("Sie schreiben mit");
  });

  test("AC-15: Abgelaufenes Projekt zeigt Datum und Ansehen", async () => {
    await pageL.goto("/");
    const article = card(pageL, expired.title);
    await expect(article).toContainText(/Abgelaufen am \d{1,2}\. \p{L}+ \d{4}/u);
    await expect(article.getByRole("link", { name: "Ansehen", exact: true })).toBeVisible();
    await expect(article.getByRole("link", { name: "Weiterschreiben" })).toHaveCount(0);
  });

  test("AC-16: Projekt löschen sehen nur Projektleitungen", async () => {
    await pageL.goto("/");
    await expect(
      card(pageL, main.title).getByRole("button", { name: `Projekt „${main.title}" löschen` }),
    ).toBeVisible();
    await expect(card(pageL, shared.title).getByRole("button", { name: /löschen/ })).toHaveCount(0);
  });

  test("AC-17: Weiterer Kauf bleibt als zweitrangiger Button erreichbar", async () => {
    await pageL.goto("/");
    await expect(pageL.getByRole("link", { name: "Weiteren Projektzugang sichern" })).toHaveAttribute(
      "href",
      "/onboarding",
    );
  });

  test("Edge: Projekt ohne Kapitel zeigt Loslegen", async () => {
    await pageL.goto("/");
    const article = card(pageL, empty.title);
    await expect(article).toContainText("Noch keine Kapitel");
    await expect(article.getByRole("link", { name: "Loslegen", exact: true })).toBeVisible();
  });

  test("Edge: Konto ohne Projekt kommt ins Onboarding und findet sein Konto", async () => {
    await pageN.goto("/");
    await expect(pageN).toHaveURL(/\/onboarding/);
    await expect(pageN.getByRole("link", { name: "Zum persönlichen Bereich" })).toHaveAttribute(
      "href",
      "/persoenlicher-bereich",
    );
    await expect(pageN.getByText(/endgültig löschen/)).toHaveCount(0);
  });

  test("AC-18, AC-19: Cover-Karte mit Buch, Autor, Kapiteln und Seiten", async () => {
    await pageL.goto(`/projektuebersicht/${main.id}`);
    const cover = pageL.locator("main section").first();
    await expect(cover.getByRole("heading", { name: main.title, level: 1 })).toBeVisible();
    await expect(cover.getByRole("img", { name: /Buchcover/ })).toBeVisible();
    await expect(cover).toContainText("Maria Muster");
    await expect(cover).toContainText("3 Kapitel, 9 Seiten im A5-Format");
    await expect(cover.getByRole("link", { name: "Cover bearbeiten" })).toHaveAttribute(
      "href",
      `/projektuebersicht/${main.id}/cover-bearbeiten`,
    );
  });

  test("AC-20: Kapitel lassen sich per Drag and Drop umsortieren", async () => {
    await pageL.goto(`/projektuebersicht/${main.id}`);
    await waitForPage(pageL);
    const rows = pageL.locator('[role="listitem"]');
    await rows.nth(2).locator('[draggable="true"]').dragTo(rows.nth(0));
    await pageL.getByRole("button", { name: "Reihenfolge speichern" }).click();
    const order = async () =>
      ((await admin.from("chapters").select("title").eq("project_id", main.id).order("sort_order"))
        .data ?? [])
        .map((row) => row.title)
        .join(",");
    await expect.poll(order, { timeout: 12_000 }).toBe("Kapitel 3,Kapitel 1,Kapitel 2");
  });

  test("AC-21: Erzähl-Impulse ansehen öffnet den bisherigen Dialog", async () => {
    await pageL.goto(`/projektuebersicht/${main.id}`);
    await waitForPage(pageL);
    await pageL.getByRole("button", { name: "Erzähl-Impulse ansehen" }).click();
    await expect(pageL.getByText("Erzähl-Impuls wählen")).toBeVisible();
    await pageL.keyboard.press("Escape");
  });

  test("AC-22, AC-23: Nutzerliste hat neue Überschrift und Person einladen", async () => {
    await pageL.goto(`/projektuebersicht/${main.id}`);
    await expect(pageL.getByRole("heading", { name: "Wer an diesem Buch beteiligt ist" })).toBeVisible();
    await expect(pageL.getByRole("button", { name: "Person einladen" })).toBeEnabled();
    await expect(pageL.getByRole("button", { name: /Mitglied „Test co" entfernen/ })).toBeEnabled();
    await expect(pageL.getByRole("button", { name: "Projekt verlassen" })).toBeEnabled();
  });

  test("AC-24: Sprachnachricht und Projektzugang stehen nebeneinander", async () => {
    await pageL.goto(`/projektuebersicht/${main.id}`);
    await expect(pageL.getByRole("heading", { name: "Erzählen per Sprachnachricht" })).toBeVisible();
    const voice = await pageL
      .getByRole("heading", { name: "Erzählen per Sprachnachricht" })
      .boundingBox();
    const access = await pageL.getByRole("heading", { name: /Projektzugang/ }).boundingBox();
    expect(Math.abs(voice!.y - access!.y)).toBeLessThan(12);
    expect(access!.x).toBeGreaterThan(voice!.x + 300);
  });

  test("AC-25, AC-26: Druck-Karte ist ein gesperrter Platzhalter", async () => {
    await pageL.goto(`/projektuebersicht/${main.id}`);
    const print = pageL.locator("section", {
      has: pageL.getByRole("heading", { name: "Buch in den Druck geben" }),
    });
    for (const step of ["1. Inhalt", "2. Cover", "3. Lieferadresse"]) {
      await expect(print.getByRole("heading", { name: step })).toBeVisible();
    }
    await expect(print).toContainText("Der Druckauftrag wird gerade vorbereitet.");
    let posts = 0;
    const count = (request: { method(): string }) => {
      if (request.method() === "POST") posts += 1;
    };
    pageL.on("request", count);
    for (const name of ["Lieferadresse eingeben", "Druckauftrag geben"]) {
      const button = print.getByRole("button", { name });
      await expect(button).toBeDisabled();
      await button.click({ force: true }).catch(() => undefined);
    }
    await pageL.waitForTimeout(500);
    pageL.off("request", count);
    expect(posts).toBe(0);
    await expect(print.locator('a[href*=".pdf"],a[download]')).toHaveCount(0);
  });

  test("AC-19, AC-27: Lesemodus bleibt auf der neuen Seite erhalten", async () => {
    await pageL.goto(`/projektuebersicht/${expired.id}`);
    await expect(pageL.getByRole("link", { name: "Cover ansehen" })).toBeVisible();
    for (const name of ["Eigenes Kapitel", "Erzähl-Impulse ansehen", "Person einladen"]) {
      await expect(pageL.getByRole("button", { name }).first()).toBeDisabled();
    }
    await expect(pageL.getByRole("link", { name: "Ansehen", exact: true }).first()).toBeVisible();
    await expect(pageL.getByRole("button", { name: /verlängern/ })).toBeEnabled();
  });

  test("AC-28, AC-30, AC-31: Persönlicher Bereich in einer Spalte", async () => {
    await pageL.goto("/persoenlicher-bereich");
    await expect(pageL.locator('main img[alt*="Banner"]')).toHaveCount(0);
    const headings = pageL.getByRole("heading", { level: 2 });
    await expect(headings).toHaveText(["Ihre Angaben", "Rechnungen", "Passwort", "Konto löschen"]);
    const email = pageL.locator("#account-email");
    await expect(email).toHaveText(L.email);
    await expect(pageL.locator('main input[type="email"]')).toHaveCount(0);
    await expect(pageL.getByText(/wenden Sie sich bitte an den Support/)).toHaveCount(0);
    await expect(
      pageL.getByText(
        "Ihre Rechnung erhalten Sie nach jedem Kauf per E-Mail. Falls Sie sie nicht mehr finden, schreiben Sie uns an kontakt@narravit.de.",
      ),
    ).toBeVisible();
  });

  test("AC-29: Der Name lässt sich ändern", async () => {
    await pageL.goto("/persoenlicher-bereich");
    await waitForPage(pageL);
    await pageL.locator("#account-name").fill("Lena Neuname");
    await pageL.getByRole("button", { name: "Name speichern" }).click();
    await expect
      .poll(
        async () =>
          (await admin.from("profiles").select("full_name").eq("id", L.id).single()).data?.full_name,
        { timeout: 10_000 },
      )
      .toBe("Lena Neuname");
  });

  test("AC-33, AC-34: Lösch-Dialog nennt das Konto und bleibt gesperrt", async () => {
    await pageL.goto("/persoenlicher-bereich");
    await waitForPage(pageL);
    await pageL.getByRole("button", { name: "Konto löschen", exact: true }).click();
    const dialog = pageL.getByRole("alertdialog");
    await expect(dialog.getByRole("heading", { name: "Konto wirklich löschen?" })).toBeVisible();
    await expect(dialog).toContainText("Ihr Konto:");
    await expect(dialog).not.toContainText("Account");
    await expect(dialog.getByRole("button", { name: "Konto endgültig löschen" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Abbrechen" }).click();
  });

  test("AC-37, BUG-1: Dialoge bleiben bei 200 % Zoom vollständig erreichbar", async () => {
    await pageL.setViewportSize({ width: 720, height: 500 });
    await pageL.goto(`/projektuebersicht/${main.id}`);
    await waitForPage(pageL);
    await pageL.getByRole("button", { name: "Erzähl-Impulse ansehen" }).click();
    const impulseTitle = pageL.getByRole("heading", { name: "Erzähl-Impuls wählen" });
    const takeOver = pageL.getByRole("button", { name: "Impuls übernehmen" });
    await takeOver.scrollIntoViewIfNeeded();
    await expect(takeOver).toBeInViewport({ ratio: 1 });
    await impulseTitle.scrollIntoViewIfNeeded();
    await expect(impulseTitle).toBeInViewport({ ratio: 1 });
    await pageL.keyboard.press("Escape");

    await pageL.goto("/");
    await waitForPage(pageL);
    await pageL.getByRole("button", { name: `Projekt „${main.title}" löschen` }).click();
    await pageL.getByRole("button", { name: "Weiter zur Bestätigung" }).click();
    const finalDelete = pageL.getByRole("button", { name: "Endgültig löschen" });
    await finalDelete.scrollIntoViewIfNeeded();
    await expect(finalDelete).toBeInViewport({ ratio: 1 });
    const stepTitle = pageL.getByRole("heading", { name: "Bestätigung: Projekt endgültig löschen" });
    await stepTitle.scrollIntoViewIfNeeded();
    await expect(stepTitle).toBeInViewport({ ratio: 1 });
    await pageL.keyboard.press("Escape");
    await pageL.setViewportSize({ width: 1440, height: 1000 });
  });

  test("AC-6, AC-7, AC-8, BUG-2: Nachfolge-Auswahl ist groß und gut lesbar", async () => {
    await pageL.goto("/persoenlicher-bereich");
    await waitForPage(pageL);
    await pageL.getByRole("button", { name: "Konto löschen", exact: true }).click();
    const dialog = pageL.getByRole("alertdialog");
    await dialog.getByRole("combobox").first().click();
    const option = pageL.getByRole("option").first();
    await expect(option).toBeVisible();
    await option.hover();
    const style = await option.evaluate((el) => {
      const computed = getComputedStyle(el);
      return {
        height: el.getBoundingClientRect().height,
        size: parseFloat(computed.fontSize),
        color: computed.color,
        background: computed.backgroundColor,
      };
    });
    expect(style.height).toBeGreaterThanOrEqual(44);
    expect(style.size).toBeGreaterThanOrEqual(16);
    expect(style.color).toBe("rgb(31, 28, 25)");
    expect(style.background).toBe("rgb(239, 235, 229)");
    await pageL.keyboard.press("Escape");
    await dialog.getByRole("button", { name: "Abbrechen" }).click();
  });

  test("Edge, BUG-3: Lange Namen und E-Mails bleiben vollständig lesbar", async () => {
    const longName =
      "Maximiliane Friederike Charlotte von und zu Hohenzollern-Sigmaringen-Wittgenstein-Berleburg";
    await pageL.setViewportSize({ width: 320, height: 640 });
    await pageL.goto("/persoenlicher-bereich");
    const email = pageL.locator("#account-email");
    await expect(email).toBeVisible();
    await expect(email).toHaveText(L.email);
    expect(await email.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);

    const name = pageL.locator("#account-name");
    await expect(name).toBeVisible();
    const singleLine = (await name.boundingBox())!.height;
    await name.fill(longName);
    await expect
      .poll(async () => (await name.boundingBox())!.height)
      .toBeGreaterThan(singleLine);
    expect(await name.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);

    await pageL.goto(`/projektuebersicht/${main.id}`);
    const row = pageL.locator("li", { hasText: L.email }).last();
    const memberEmail = row.getByText(L.email);
    await expect(memberEmail).toBeVisible();
    expect(
      await memberEmail.evaluate(
        (el) => getComputedStyle(el).textOverflow !== "ellipsis" && el.scrollWidth <= el.clientWidth + 1,
      ),
    ).toBe(true);
    await pageL.setViewportSize({ width: 1440, height: 1000 });
  });

  test("AC-36: Auf dem Handy stehen die Karten untereinander, das Buch bleibt sichtbar", async () => {
    await pageL.setViewportSize({ width: 375, height: 812 });
    await pageL.goto("/");
    await expect(pageL.locator("main article").first()).toBeVisible();
    const first = await pageL.locator("main article").nth(0).boundingBox();
    const second = await pageL.locator("main article").nth(1).boundingBox();
    expect(second!.y).toBeGreaterThan(first!.y + first!.height - 1);
    const book = await pageL.locator("main article [role='img']").first().boundingBox();
    expect(book!.x).toBeGreaterThanOrEqual(0);
    expect(book!.x + book!.width).toBeLessThanOrEqual(375);
    await pageL.setViewportSize({ width: 1440, height: 1000 });
  });

  test("AC-16: Projekt löschen läuft über den bisherigen Sicherheitsdialog", async () => {
    const temp = await createProject({
      title: "Zum Löschen",
      members: [[L, "projektleiter"]],
      chapters: 1,
      color: "creme",
    });
    await pageL.goto("/");
    await waitForPage(pageL);
    await pageL.getByRole("button", { name: `Projekt „${temp.title}" löschen` }).click();
    await pageL.getByRole("button", { name: "Weiter zur Bestätigung" }).click();
    const phrase = (await pageL.locator("p.font-mono").innerText()).trim();
    await pageL.getByLabel("Bestätigungstext eingeben").fill(phrase);
    await pageL.getByRole("button", { name: "Endgültig löschen" }).click();
    await expect
      .poll(
        async () =>
          (
            await admin
              .from("trash_projects")
              .select("project_id", { count: "exact", head: true })
              .eq("project_id", temp.id)
          ).count,
        { timeout: 15_000 },
      )
      .toBe(1);
    await pageL.goto("/");
    await expect(card(pageL, temp.title)).toHaveCount(0);
  });
});
