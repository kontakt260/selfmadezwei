import type { Page } from "@playwright/test";

// Mess- und Steuer-Helfer für den Kapitel-Editor (PROJ-5).
//
// Kern ist `auditEditor`: es prüft die Zero-Overflow-Garantie der Spec
// direkt am gerenderten Layout — jede Textzeile und jede Bildreihe muss
// vollständig im Inhaltsbereich genau einer A5-Seite liegen.

export type EditorAudit = {
  /** Anzahl gerenderter Seiten. */
  pages: number;
  /** Anzahl der Blöcke auf oberster Ebene des Dokuments. */
  topLevelBlocks: number;
  /** Anzahl gemessener Textzeilen. */
  lines: number;
  /** Verstöße gegen die Seitengrenzen (leer = alles in Ordnung). */
  violations: Array<{ kind: string; page?: number; by?: number; text?: string }>;
  /**
   * Pro Seite: Abstand der ersten Textzeile zur Oberkante des
   * Inhaltsbereichs in px (null = Seite ohne Text).
   */
  firstLineOffsets: Array<number | null>;
  /** Höchste Seitennummer, auf der Text steht (0 = kein Text). */
  lastTextPage: number;
  /** Höhen der manuellen Seitenumbrüche in px. */
  pageBreaks: number[];
};

export type CaretInfo = {
  /** Seite, auf der der Cursor steht (0 = außerhalb jeder Seite). */
  page: number;
  /** Cursor liegt im Inhaltsbereich seiner Seite. */
  inContentArea: boolean;
  /** Höhe des Cursors in logischen px. */
  height: number;
  /** Cursor liegt im sichtbaren Bereich des Fensters. */
  inViewport: boolean;
  /** Abstand der Cursor-Oberkante zur Oberkante des Inhaltsbereichs. */
  offsetInPage: number;
  head: number;
  docSize: number;
};

type Json = Record<string, unknown>;

const SENTENCES = [
  "Als ich ein Kind war, lebten wir in einem kleinen Haus am Rand der Stadt, wo die Felder begannen und der Wind immer nach frisch gemähtem Gras roch.",
  "Meine Mutter stand jeden Morgen vor Sonnenaufgang auf, um das Brot in den Ofen zu schieben, und der Duft zog durch alle Zimmer.",
  "Mein Vater arbeitete in der Schreinerei seines Bruders und brachte abends oft kleine Holzfiguren mit, die er in der Mittagspause geschnitzt hatte.",
  "Wir Kinder spielten bis zur Dämmerung draußen, bauten Dämme im Bach und sammelten Kastanien, die wir im Herbst zu langen Ketten auffädelten.",
  "Im Winter war es in der Küche am wärmsten, und dort erzählte uns die Großmutter Geschichten aus einer Zeit, die uns unendlich fern erschien.",
  "Die Schule lag zwei Kilometer entfernt, und wir gingen bei jedem Wetter zu Fuß, manchmal durch kniehohen Schnee, manchmal durch strömenden Regen.",
  "An Sonntagen zog die ganze Familie ihre besten Kleider an und ging gemeinsam zur Kirche, danach gab es Braten und einen Kuchen mit Pflaumen vom eigenen Baum.",
  "Ich erinnere mich noch genau an den Tag, an dem das erste Radio ins Haus kam und wir alle andächtig um den kleinen Kasten herumsaßen.",
];

/** Fließtext aus `count` Sätzen, beginnend bei Satz `offset`. */
export const prose = (count: number, offset = 0): string =>
  Array.from({ length: count }, (_, i) => SENTENCES[(i + offset) % SENTENCES.length]).join(" ");

export const paragraph = (text?: string): Json => ({
  type: "paragraph",
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
export const pageBreak = (): Json => ({ type: "pageBreak" });
export const blockquote = (...texts: string[]): Json => ({
  type: "blockquote",
  content: texts.map((t) => paragraph(t)),
});
export const list = (kind: "bulletList" | "orderedList", items: string[]): Json => ({
  type: kind,
  content: items.map((t) => ({ type: "listItem", content: [paragraph(t)] })),
});
export const doc = (...content: Json[]): Json => ({ type: "doc", content });

/** Wartet, bis der Editor geladen und die erste Pagination abgeschlossen ist. */
export async function waitForEditorReady(page: Page): Promise<void> {
  await page.locator('.a5-stack[data-ready="1"]').waitFor({ timeout: 30_000 });
}

/**
 * Wartet, bis der aktuelle Stand gespeichert ist. Der Status zeigt
 * „Gespeichert" nur, wenn nichts mehr aussteht — solange eine Änderung auf
 * ihren Auto-Save wartet, steht dort „Wird gespeichert…".
 */
export async function waitForSaved(page: Page): Promise<void> {
  await page.getByText("Gespeichert", { exact: true }).waitFor({ timeout: 20_000 });
}

/** Ersetzt den Editor-Inhalt (löst Auto-Save und Pagination aus). */
export async function setEditorContent(page: Page, content: Json): Promise<void> {
  await page.evaluate((json) => {
    const el = document.querySelector(".tiptap-editor") as HTMLElement & {
      editor: { commands: { setContent: (c: unknown, o: unknown) => void } };
    };
    el.editor.commands.setContent(json, { emitUpdate: true });
  }, content);
}

/** Setzt den Cursor an eine Dokument-Position, den Anfang oder das Ende. */
export async function focusEditorAt(page: Page, position: number | "start" | "end"): Promise<void> {
  await page.evaluate((pos) => {
    const el = document.querySelector(".tiptap-editor") as HTMLElement & {
      editor: { commands: { focus: (p: unknown) => void } };
    };
    el.editor.commands.focus(pos);
  }, position);
  // Tiptap fokussiert und scrollt erst im nächsten Frame.
  await page.waitForTimeout(250);
}

export async function selectEditorRange(page: Page, from: number, to: number): Promise<void> {
  await page.evaluate(
    ([f, t]) => {
      const el = document.querySelector(".tiptap-editor") as HTMLElement & {
        editor: { chain: () => { focus: () => { setTextSelection: (r: unknown) => { run: () => void } } } };
      };
      el.editor.chain().focus().setTextSelection({ from: f, to: t }).run();
    },
    [from, to],
  );
  await page.waitForTimeout(250);
}

/** Dokument-Position des ersten Soft-Breaks (Seitenwechsel mitten im Absatz). */
export async function firstSoftBreakPosition(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector(".tiptap-editor") as HTMLElement & {
      editor: { view: { posAtDOM: (n: Node, o: number) => number } };
    };
    const spacer = document.querySelector(".a5-soft-break-spacer");
    if (!spacer || !spacer.parentNode) return -1;
    const index = Array.prototype.indexOf.call(spacer.parentNode.childNodes, spacer);
    return el.editor.view.posAtDOM(spacer.parentNode, index);
  });
}

export async function auditEditor(page: Page): Promise<EditorAudit> {
  return page.evaluate(() => {
    const fg = document.querySelector(".a5-stack__fg") as HTMLElement;
    const frames = Array.from(document.querySelectorAll<HTMLElement>(".a5-page-frame"));
    const first = frames[0];
    const zoom = first.getBoundingClientRect().height / parseFloat(getComputedStyle(first).height);
    const fgStyle = getComputedStyle(fg);
    const marginTop = parseFloat(fgStyle.paddingTop) * zoom;
    const marginBottom = parseFloat(fgStyle.paddingBottom) * zoom;
    // Toleranz für Subpixel-Rundung (wächst mit dem UI-Zoom).
    const tolerance = 1.5 * zoom;
    const pages = frames.map((frame, i) => {
      const r = frame.getBoundingClientRect();
      return {
        number: i + 1,
        top: r.top,
        bottom: r.bottom,
        contentTop: r.top + marginTop,
        contentBottom: r.bottom - marginBottom,
      };
    });
    const pageAt = (y: number) => pages.find((p) => y >= p.top && y <= p.bottom);

    const violations: Array<{ kind: string; page?: number; by?: number; text?: string }> = [];
    const lines: Array<{ top: number; bottom: number; page: number }> = [];

    for (const block of document.querySelectorAll<HTMLElement>(".tiptap-editor p")) {
      // Textknoten einsammeln — Pagination-Spacer gehören nicht zum Text.
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) =>
          node.parentElement?.closest(".a5-soft-break-spacer, .a5-block-push-spacer") ||
          !node.textContent?.trim()
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
      });
      const rects: Array<{ top: number; bottom: number; text: string }> = [];
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects()) {
          if (r.width > 0 && r.height > 0) {
            rects.push({ top: r.top, bottom: r.bottom, text: (node.textContent ?? "").slice(0, 24) });
          }
        }
      }
      rects.sort((a, b) => a.top - b.top);
      const merged: typeof rects = [];
      for (const r of rects) {
        const last = merged[merged.length - 1];
        if (last && Math.abs(last.top - r.top) < 3) last.bottom = Math.max(last.bottom, r.bottom);
        else merged.push({ ...r });
      }
      for (const line of merged) {
        const page = pageAt((line.top + line.bottom) / 2);
        if (!page) {
          violations.push({ kind: "Zeile im Seitenzwischenraum", text: line.text });
          continue;
        }
        lines.push({ top: line.top, bottom: line.bottom, page: page.number });
        if (line.top < page.contentTop - tolerance) {
          violations.push({
            kind: "Zeile im oberen Rand",
            page: page.number,
            by: Math.round((page.contentTop - line.top) / zoom),
            text: line.text,
          });
        } else if (line.bottom > page.contentBottom + tolerance) {
          violations.push({
            kind: "Zeile im unteren Rand",
            page: page.number,
            by: Math.round((line.bottom - page.contentBottom) / zoom),
            text: line.text,
          });
        }
      }
    }

    // Bildreihen. PROJ-34: Leere Platzhalter gibt es nicht mehr.
    for (const row of document.querySelectorAll<HTMLElement>("[data-paginate-row]")) {
      const r = row.getBoundingClientRect();
      const page = pageAt((r.top + r.bottom) / 2);
      if (!page) violations.push({ kind: "Bildreihe im Seitenzwischenraum" });
      else if (r.top < page.contentTop - tolerance)
        violations.push({ kind: "Bildreihe im oberen Rand", page: page.number });
      else if (r.bottom > page.contentBottom + tolerance)
        violations.push({ kind: "Bildreihe im unteren Rand", page: page.number });
    }

    const firstLineOffsets = pages.map((p) => {
      const onPage = lines.filter((l) => l.page === p.number);
      if (onPage.length === 0) return null;
      const top = Math.min(...onPage.map((l) => l.top));
      return Math.round((top - p.contentTop) / zoom);
    });

    const editorEl = document.querySelector(".tiptap-editor") as HTMLElement & {
      editor: { state: { doc: { childCount: number } } };
    };
    return {
      pages: pages.length,
      topLevelBlocks: editorEl.editor.state.doc.childCount,
      lines: lines.length,
      violations,
      firstLineOffsets,
      lastTextPage: lines.reduce((max, l) => Math.max(max, l.page), 0),
      pageBreaks: Array.from(document.querySelectorAll<HTMLElement>(".a5-page-break")).map((hr) =>
        Math.round(hr.getBoundingClientRect().height / zoom),
      ),
    };
  });
}

export async function caretInfo(page: Page): Promise<CaretInfo> {
  return page.evaluate(() => {
    const el = document.querySelector(".tiptap-editor") as HTMLElement & {
      editor: {
        view: {
          coordsAtPos: (p: number) => { top: number; bottom: number };
          state: { selection: { head: number }; doc: { content: { size: number } } };
        };
      };
    };
    const view = el.editor.view;
    const coords = view.coordsAtPos(view.state.selection.head);
    const fg = document.querySelector(".a5-stack__fg") as HTMLElement;
    const frames = Array.from(document.querySelectorAll<HTMLElement>(".a5-page-frame"));
    const zoom =
      frames[0].getBoundingClientRect().height / parseFloat(getComputedStyle(frames[0]).height);
    const fgStyle = getComputedStyle(fg);
    const marginTop = parseFloat(fgStyle.paddingTop) * zoom;
    const marginBottom = parseFloat(fgStyle.paddingBottom) * zoom;
    const middle = (coords.top + coords.bottom) / 2;
    let pageNumber = 0;
    let inContentArea = false;
    let offsetInPage = 0;
    frames.forEach((frame, i) => {
      const r = frame.getBoundingClientRect();
      if (middle >= r.top && middle <= r.bottom) {
        pageNumber = i + 1;
        inContentArea =
          coords.top >= r.top + marginTop - 3 * zoom && coords.bottom <= r.bottom - marginBottom + 3 * zoom;
        offsetInPage = Math.round((coords.top - (r.top + marginTop)) / zoom);
      }
    });
    return {
      page: pageNumber,
      inContentArea,
      height: Math.round((coords.bottom - coords.top) / zoom),
      inViewport: coords.top >= 0 && coords.bottom <= window.innerHeight,
      offsetInPage,
      head: view.state.selection.head,
      docSize: view.state.doc.content.size,
    };
  });
}

/** Seitenrahmen in Dokument-Koordinaten (unabhängig von der Scroll-Position). */
export async function pageFrames(
  page: Page,
): Promise<Array<{ top: number; bottom: number; left: number; right: number }>> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll(".a5-page-frame")).map((frame) => {
      const r = frame.getBoundingClientRect();
      return {
        top: r.top + window.scrollY,
        bottom: r.bottom + window.scrollY,
        left: r.left,
        right: r.right,
      };
    }),
  );
}

/** Klickt auf einen Punkt in Dokument-Koordinaten (scrollt ihn vorher in die Bildmitte). */
export async function clickAtDocumentY(page: Page, x: number, documentY: number): Promise<void> {
  await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - window.innerHeight / 2)), documentY);
  await page.waitForTimeout(150);
  const scrollY = await page.evaluate(() => window.scrollY);
  await page.mouse.click(x, documentY - scrollY);
  await page.waitForTimeout(300);
}
