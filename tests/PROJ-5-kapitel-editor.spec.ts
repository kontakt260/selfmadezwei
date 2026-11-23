import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { QA_PROJECT_ID, deleteQaChapters } from "./helpers/qa-project";
import { waitForPage } from "./helpers/page-ready";
import {
  auditEditor,
  blockquote,
  caretInfo,
  clickAtDocumentY,
  doc,
  firstSoftBreakPosition,
  focusEditorAt,
  list,
  pageBreak,
  pageFrames,
  paragraph,
  prose,
  selectEditorRange,
  setEditorContent,
  waitForEditorReady,
  waitForSaved,
} from "./helpers/editor-audit";

// PROJ-5 — Kapitel-Editor: Seitenumbrüche (Pagination-Engine).
//
// Prüft die Zero-Overflow-Garantie der Spec am gerenderten Layout und die
// Bedienung rund um Seitengrenzen. Regressionen vom 2026-11-16:
//   - Soft-Break-Versatz: jede Folgeseite begann eine Zeile tiefer.
//   - Silbentrennung beim Laden verschmolz Absätze.
//   - Listen-Marker blieb allein auf der alten Seite.
//   - Zitat-Rand-Maske schnitt kursive Buchstaben ab.
//   - Seitenumbruch bei markiertem Text brauchte zwei Klicks.
//   - Pfeil runter am Seitenende sprang ans Dokumentende.
//   - Klick in Seitenrand/Zwischenraum warf den Cursor an Anfang oder Ende.
//   - Leerer Bild-Platzhalter erzeugte eine Phantomseite.
//
// Die Tests teilen sich EIN Kapitel und EINE Seite (der Editor braucht pro
// Laden ~5 s zum Einschwingen) und laufen deshalb strikt nacheinander.

const STORAGE_STATE = "tests/.auth/user.json";
const PROJECT_URL = `/projektuebersicht/${QA_PROJECT_ID}`;
const CHAPTER_TITLE = "PROJ-5 Umbruch-Testkapitel";
const PAGE_MARGIN = (2 / 2.54) * 96; // 2 cm oberer/unterer Seitenrand in px

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "Der Kapitel-Editor ist auf dem Smartphone nicht verfügbar.");

let context: BrowserContext;
let page: Page;

// Wartet, bis die Pagination zur Ruhe gekommen ist und keine Zeile mehr
// außerhalb des Inhaltsbereichs liegt; liefert die letzte Messung.
async function settledAudit() {
  await expect
    .poll(async () => (await auditEditor(page)).violations, { timeout: 8_000 })
    .toEqual([]);
  // Zwei gleiche Messungen im Abstand von 300 ms = Layout steht. Die Wartezeit
  // steht bewusst IN der Messung: `expect.poll` ruft sofort auf, ohne sie
  // lägen beide Messungen im selben Frame. Nach einem Umbruch braucht die
  // Pagination drei Frames, der Test traf sonst gelegentlich diesen
  // Zwischenstand (AC-Break-1, 2026-11-22).
  let previous = JSON.stringify(await auditEditor(page));
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(300);
        const current = JSON.stringify(await auditEditor(page));
        const stable = current === previous;
        previous = current;
        return stable;
      },
      { timeout: 8_000, intervals: [50] },
    )
    .toBe(true);
  return auditEditor(page);
}

function expectPagesStartAtTop(offsets: Array<number | null>) {
  offsets.slice(1).forEach((offset, i) => {
    if (offset === null) return;
    expect(offset, `Seite ${i + 2} beginnt nicht am oberen Rand des Inhaltsbereichs`).toBeLessThanOrEqual(2);
    expect(offset, `Seite ${i + 2} beginnt im oberen Seitenrand`).toBeGreaterThanOrEqual(-1);
  });
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  context = await browser.newContext({
    storageState: STORAGE_STATE,
    viewport: { width: 1280, height: 900 },
  });
  page = await context.newPage();
  await deleteQaChapters(page, CHAPTER_TITLE);
  await page.goto(PROJECT_URL);
  await waitForPage(page);
  await page.locator("button", { hasText: "Eigenes Kapitel" }).first().click();
  await page.getByPlaceholder("z. B. Reisen und Begegnungen").fill(CHAPTER_TITLE);
  await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
  await page.waitForURL(/kapiteleditor/, { timeout: 15_000 });
  await waitForEditorReady(page);
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  if (page) await deleteQaChapters(page, CHAPTER_TITLE);
  await context?.close();
});

// ─── Zero-Overflow ─────────────────────────────────────────────────────────

test.describe("PROJ-5 — Seitenumbrüche im Fließtext", () => {
  const paragraphs = [
    prose(5), "Ein kurzer Satz.", prose(2, 3), prose(8, 1), prose(3, 5), prose(7, 2), prose(1, 6),
    prose(9, 4), prose(4, 7), prose(6, 0), prose(2, 2), prose(10, 5), prose(3, 1),
  ];

  test("AC-Pag-1: jede Zeile liegt im Inhaltsbereich, Folgeseiten beginnen am oberen Rand", async () => {
    await setEditorContent(page, doc(...paragraphs.map((p) => paragraph(p))));
    const audit = await settledAudit();
    expect(audit.pages).toBeGreaterThanOrEqual(6);
    expect(audit.lines).toBeGreaterThan(120);
    expectPagesStartAtTop(audit.firstLineOffsets);
  });

  test("AC-Pag-2: Absätze bleiben nach Speichern und Neuladen erhalten", async () => {
    await waitForSaved(page);
    for (let round = 1; round <= 2; round++) {
      await page.reload();
      await waitForEditorReady(page);
      const audit = await settledAudit();
      expect(audit.topLevelBlocks, `Absätze nach Neuladen ${round}`).toBe(paragraphs.length);
      expectPagesStartAtTop(audit.firstLineOffsets);
      // Nach dem Laden speichert der Editor Seitenzahl und Silbentrennung —
      // abwarten, damit die nächste Runde genau diesen Stand lädt.
      await waitForSaved(page);
    }
  });

  test("AC-Save-1: ungespeicherte Änderungen überstehen das sofortige Verlassen der Seite", async () => {
    // Regression 2026-11-16: Auto-Save wartet 2 s. Wer vorher zur
    // Projektübersicht zurückging, verlor die letzten Änderungen.
    const marker = `Letzter Satz ${Date.now()}.`;
    await setEditorContent(page, doc(paragraph(prose(2)), paragraph(marker)));
    await expect(page.getByText("Wird gespeichert…")).toBeVisible();
    const editorUrl = page.url();
    // Der Editor speichert beim Verlassen sofort; die Anfrage läuft weiter,
    // während die Projektübersicht schon angezeigt wird.
    const saveRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.request().headers()["next-action"] !== undefined,
      { timeout: 15_000 },
    );
    await page.getByRole("link", { name: "Zurück zur Projektübersicht" }).click();
    await page.waitForURL((url) => !url.pathname.includes("/kapiteleditor/"), { timeout: 15_000 });
    expect((await saveRequest).ok()).toBe(true);
    await page.goto(editorUrl);
    await waitForEditorReady(page);
    await expect(page.locator(".tiptap-editor")).toContainText(marker);
  });

  test("AC-Pag-3: ein einzelner Absatz über mehrere Seiten bricht zeilenweise", async () => {
    await setEditorContent(page, doc(paragraph(prose(48))));
    const audit = await settledAudit();
    expect(audit.pages).toBeGreaterThanOrEqual(4);
    expectPagesStartAtTop(audit.firstLineOffsets);
  });

  test("AC-Pag-4: Zeilenabstand, Einrückung und harte Zeilenumbrüche", async () => {
    const withAttrs = (text: string, attrs: Record<string, unknown>) => ({ ...paragraph(text), attrs });
    await setEditorContent(
      page,
      doc(
        ...Array.from({ length: 9 }, (_, i) =>
          withAttrs(prose(4, i), { lineHeight: ["1", "1.5", "2"][i % 3], indent: i % 3 }),
        ),
        {
          type: "paragraph",
          content: Array.from({ length: 40 }, (_, i) => [
            ...(i ? [{ type: "hardBreak" }] : []),
            { type: "text", text: `Vers ${i + 1}, der hier steht` },
          ]).flat(),
        },
      ),
    );
    const audit = await settledAudit();
    expectPagesStartAtTop(audit.firstLineOffsets);
  });

  test("AC-Pag-5: Tippen am Seitenende fließt auf die nächste Seite", async () => {
    await setEditorContent(page, doc(paragraph(prose(8)), paragraph(prose(3, 1))));
    await settledAudit();
    await focusEditorAt(page, "end");
    await page.keyboard.type(" " + prose(3, 2), { delay: 1 });
    const audit = await settledAudit();
    expect(audit.pages).toBe(2);
    expectPagesStartAtTop(audit.firstLineOffsets);
    const caret = await caretInfo(page);
    expect(caret.page).toBe(2);
    expect(caret.inContentArea).toBe(true);
    expect(caret.inViewport).toBe(true);
  });

  test("AC-Pag-6: Löschen lässt Seiten wieder schrumpfen", async () => {
    await setEditorContent(page, doc(...Array.from({ length: 12 }, (_, i) => paragraph(prose(5, i)))));
    expect((await settledAudit()).pages).toBeGreaterThanOrEqual(5);
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await expect.poll(async () => (await auditEditor(page)).pages, { timeout: 8_000 }).toBe(1);
  });

  test("AC-Pag-7: UI-Zoom 150 % ändert die Seitenaufteilung nicht", async () => {
    await setEditorContent(page, doc(...Array.from({ length: 10 }, (_, i) => paragraph(prose(5, i)))));
    const normal = await settledAudit();
    await page.getByLabel("Vergrößern").click();
    await page.getByLabel("Vergrößern").click();
    const zoomed = await settledAudit();
    expect(zoomed.pages).toBe(normal.pages);
    await page.getByLabel("Verkleinern").click();
    await page.getByLabel("Verkleinern").click();
    await settledAudit();
  });
});

// ─── Listen und Zitate ─────────────────────────────────────────────────────

test.describe("PROJ-5 — Listen und Zitate an der Seitengrenze", () => {
  test("AC-List-1: der Listen-Marker wandert mit dem Listenpunkt auf die neue Seite", async () => {
    await setEditorContent(
      page,
      doc(
        paragraph(prose(7)),
        list("orderedList", Array.from({ length: 40 }, (_, i) => `Punkt ${i + 1}: ${prose(1, i).slice(0, 50)}`)),
        paragraph(prose(2)),
      ),
    );
    const audit = await settledAudit();
    expect(audit.pages).toBeGreaterThanOrEqual(3);
    expectPagesStartAtTop(audit.firstLineOffsets);
    // Ein ganzer Listenpunkt wird VOR dem <li> auf die neue Seite geschoben.
    // Ein Spacer am Absatzanfang im <li> ließe den Marker allein zurück.
    const markerOrphans = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".tiptap-editor li > p")).filter((p) => {
        const spacer = p.querySelector(".a5-soft-break-spacer");
        if (!spacer) return false;
        let textBefore = "";
        for (let n = p.firstChild; n && n !== spacer; n = n.nextSibling) textBefore += n.textContent ?? "";
        return textBefore.trim() === "";
      }).length,
    );
    expect(markerOrphans).toBe(0);
    await expect(page.locator(".tiptap-editor ol > .a5-block-push-spacer").first()).toBeAttached();
  });

  test("AC-List-2: lange Listenpunkte brechen zeilenweise", async () => {
    await setEditorContent(
      page,
      doc(
        paragraph(prose(6)),
        list("bulletList", Array.from({ length: 14 }, (_, i) => prose(2, i))),
        paragraph(prose(3)),
      ),
    );
    const audit = await settledAudit();
    expectPagesStartAtTop(audit.firstLineOffsets);
  });

  test("AC-Quote-1: Blockzitat über die Seitengrenze — Rand ausgespart, Text nicht maskiert", async () => {
    await setEditorContent(
      page,
      doc(paragraph(prose(6)), blockquote(prose(5, 1), prose(4, 2), prose(6, 3)), paragraph(prose(4))),
    );
    const audit = await settledAudit();
    expectPagesStartAtTop(audit.firstLineOffsets);
    const style = await page.locator(".tiptap-editor blockquote").first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        mask: cs.maskImage || cs.webkitMaskImage,
        background: cs.backgroundImage,
        borderLeftColor: cs.borderLeftColor,
      };
    });
    // Keine Maske über dem Text (sie kappte kursive Buchstaben am rechten Rand) …
    expect(style.mask).toBe("none");
    // … der Rand wird stattdessen mit Lücken gezeichnet.
    expect(style.background).toContain("linear-gradient");
    expect(style.borderLeftColor).toBe("rgba(0, 0, 0, 0)");
  });
});

// ─── Manueller Seitenumbruch ───────────────────────────────────────────────

test.describe("PROJ-5 — Manueller Seitenumbruch", () => {
  const breakButton = () => page.getByLabel("Seitenumbruch einfügen");
  const threeParagraphs = () => doc(paragraph(prose(4)), paragraph(prose(4, 2)), paragraph(prose(4, 4)));

  test("AC-Break-1: Umbruch mitten im Absatz teilt ihn; Backspace nimmt den Umbruch zurück", async () => {
    await setEditorContent(page, threeParagraphs());
    await settledAudit();
    const position = await page.evaluate(() => {
      const el = document.querySelector(".tiptap-editor") as HTMLElement & {
        editor: { state: { doc: { child: (i: number) => { nodeSize: number } } } };
      };
      return el.editor.state.doc.child(0).nodeSize + 200;
    });
    await focusEditorAt(page, position);
    await breakButton().click();
    let audit = await settledAudit();
    expect(audit.pageBreaks).toHaveLength(1);
    expect(audit.topLevelBlocks).toBe(5);
    expectPagesStartAtTop(audit.firstLineOffsets);
    let caret = await caretInfo(page);
    expect(caret.page).toBe(2);
    expect(caret.offsetInPage).toBeLessThanOrEqual(6);

    await page.keyboard.press("Backspace");
    audit = await settledAudit();
    expect(audit.pageBreaks).toHaveLength(0);
    caret = await caretInfo(page);
    expect(caret.page).toBe(1);
  });

  test("AC-Break-2: markierter Text wird mit EINEM Klick durch den Umbruch ersetzt", async () => {
    await setEditorContent(page, threeParagraphs());
    await settledAudit();
    const before = await page.evaluate(
      () => (document.querySelector(".tiptap-editor") as HTMLElement).innerText.length,
    );
    await selectEditorRange(page, 100, 200);
    await breakButton().click();
    const audit = await settledAudit();
    expect(audit.pageBreaks).toHaveLength(1);
    const after = await page.evaluate(
      () => (document.querySelector(".tiptap-editor") as HTMLElement).innerText.length,
    );
    expect(after).toBeLessThan(before - 80);
    // Ein Rückgängig-Schritt stellt Text und Struktur wieder her.
    await page.getByLabel("Rückgängig").click();
    expect((await settledAudit()).pageBreaks).toHaveLength(0);
  });

  test("AC-Break-3: Umbruch am Dokumentende — Cursor landet sichtbar auf der neuen Seite", async () => {
    await setEditorContent(page, threeParagraphs());
    await settledAudit();
    await focusEditorAt(page, "end");
    await breakButton().click();
    const audit = await settledAudit();
    expect(audit.pageBreaks).toHaveLength(1);
    await expect
      .poll(async () => (await caretInfo(page)).inViewport, { timeout: 5_000 })
      .toBe(true);
    const caret = await caretInfo(page);
    expect(caret.page).toBe(audit.pages);
    expect(caret.inContentArea).toBe(true);
    await page.keyboard.type("Text auf der neuen Seite.", { delay: 2 });
    const typed = await settledAudit();
    expect(typed.lastTextPage).toBe(typed.pages);
  });

  test("AC-Break-4: zwei Umbrüche in Folge ergeben eine Leerseite; Soft-Breaks davor bleiben korrekt", async () => {
    await setEditorContent(
      page,
      doc(paragraph(prose(12)), paragraph(prose(9, 2)), pageBreak(), pageBreak(), paragraph(prose(10, 3))),
    );
    const audit = await settledAudit();
    expect(audit.pageBreaks).toHaveLength(2);
    expectPagesStartAtTop(audit.firstLineOffsets);
    // Zwischen den beiden Umbrüchen liegt genau eine Seite ohne Text.
    const emptyPages = audit.firstLineOffsets.filter((offset) => offset === null).length;
    expect(emptyPages).toBe(1);
  });
});

// ─── Cursor an der Seitengrenze ────────────────────────────────────────────

test.describe("PROJ-5 — Cursor an der Seitengrenze", () => {
  test.beforeAll(async () => {
    // Ein Absatz, der mitten im Text auf Seite 2 umbricht.
    await setEditorContent(page, doc(paragraph(prose(14))));
    await settledAudit();
  });

  test("AC-Caret-1: Pfeil runter/hoch wechselt zeilenweise über die Seitengrenze", async () => {
    const softBreak = await firstSoftBreakPosition(page);
    expect(softBreak).toBeGreaterThan(0);
    // Cursor in die letzte Zeile von Seite 1 (kurz vor der Bruchstelle).
    await focusEditorAt(page, softBreak - 30);
    expect((await caretInfo(page)).page).toBe(1);

    await page.keyboard.press("ArrowDown");
    let caret = await caretInfo(page);
    expect(caret.page).toBe(2);
    expect(caret.offsetInPage, "erste Zeile der neuen Seite").toBeLessThanOrEqual(6);
    expect(caret.head).toBeLessThan(softBreak + 120);

    await page.keyboard.press("ArrowUp");
    caret = await caretInfo(page);
    expect(caret.page).toBe(1);
    expect(caret.head).toBeLessThan(softBreak);
  });

  test("AC-Caret-2: Shift+Pfeil runter erweitert die Markierung über die Seitengrenze", async () => {
    const softBreak = await firstSoftBreakPosition(page);
    await focusEditorAt(page, softBreak - 30);
    await page.keyboard.press("Shift+ArrowDown");
    const selection = await page.evaluate(() => {
      const el = document.querySelector(".tiptap-editor") as HTMLElement & {
        editor: { state: { selection: { anchor: number; head: number } } };
      };
      const { anchor, head } = el.editor.state.selection;
      return { anchor, head };
    });
    expect(selection.anchor).toBe(softBreak - 30);
    expect(selection.head).toBeGreaterThan(softBreak);
    expect((await caretInfo(page)).page).toBe(2);
  });

  test("AC-Caret-3: Klick in Seitenrand oder Zwischenraum setzt den Cursor in die nächste Zeile dieser Seite", async () => {
    const frames = await pageFrames(page);
    const editorBox = await page.locator(".tiptap-editor").boundingBox();
    if (!editorBox) throw new Error("Editor nicht sichtbar");
    const centerX = editorBox.x + editorBox.width / 2;
    const contentBottomPage1 = frames[0].bottom - PAGE_MARGIN;

    const cases: Array<{ name: string; x: number; y: number; page: number; firstLine?: boolean }> = [
      { name: "unterer Rand Seite 1", x: centerX, y: frames[0].bottom - 30, page: 1 },
      { name: "Zwischenraum, obere Hälfte", x: centerX, y: frames[0].bottom + 8, page: 1 },
      { name: "Zwischenraum, untere Hälfte", x: centerX, y: frames[1].top - 8, page: 2, firstLine: true },
      { name: "oberer Rand Seite 2", x: centerX, y: frames[1].top + 30, page: 2, firstLine: true },
      { name: "linker Seitenrand neben Seite 1", x: frames[0].left + 20, y: contentBottomPage1 - 200, page: 1 },
    ];
    for (const c of cases) {
      await focusEditorAt(page, 5);
      await clickAtDocumentY(page, c.x, c.y);
      const caret = await caretInfo(page);
      expect(caret.page, c.name).toBe(c.page);
      expect(caret.inContentArea, c.name).toBe(true);
      if (c.firstLine) expect(caret.offsetInPage, c.name).toBeLessThanOrEqual(6);
    }
  });

  test("AC-Caret-4: Klick in den Weißraum unter dem Text setzt den Cursor ans Dokumentende", async () => {
    const frames = await pageFrames(page);
    const last = frames[frames.length - 1];
    await focusEditorAt(page, 5);
    await clickAtDocumentY(page, (last.left + last.right) / 2, last.bottom - 150);
    const caret = await caretInfo(page);
    expect(caret.head).toBeGreaterThanOrEqual(caret.docSize - 1);
  });
});

// ─── Seitenzahl ────────────────────────────────────────────────────────────

test.describe("PROJ-5 — Seitenzahl", () => {
  test("AC-Count-1: der leere Bild-Platzhalter erzeugt keine Phantomseite", async () => {
    // Text wächst Zeile für Zeile über das Ende von Seite 1 hinaus. Die
    // gespeicherte Seitenzahl muss immer die Seite der letzten Textzeile
    // sein — auch wenn der „Bild hinzufügen"-Platzhalter am Kapitelende
    // nicht mehr in den Inhaltsbereich passt.
    for (let count = 16; count <= 23; count++) {
      await setEditorContent(
        page,
        doc(...Array.from({ length: count }, (_, i) => paragraph(`Zeile ${i + 1} — kurzer Absatz.`))),
      );
      const audit = await settledAudit();
      expect(audit.pages, `${count} Absätze`).toBe(audit.lastTextPage);
    }
    // Die Fußzeile nennt dieselbe Zahl, die als page_count gespeichert wird.
    const audit = await auditEditor(page);
    await expect(page.locator("footer")).toContainText(
      audit.pages === 1 ? "Seite 1" : `${audit.pages} Seiten`,
    );
  });
});
