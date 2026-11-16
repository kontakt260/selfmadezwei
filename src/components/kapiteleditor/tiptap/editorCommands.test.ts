import { afterEach, describe, expect, it } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { editorExtensions } from "./extensions";

// Editor mit dem echten Schema des Kapitel-Editors. Die Pagination-
// Erweiterung misst das gerenderte Layout (ResizeObserver, Seitenrahmen) —
// in jsdom gibt es kein Layout, deshalb bleibt sie hier außen vor.
const extensions = editorExtensions.filter((e) => e.name !== "paginationDecorations");

const SOFT_HYPHEN = /­/g;
const text = (t: string, marks?: JSONContent["marks"]): JSONContent => ({
  type: "text",
  text: t,
  ...(marks ? { marks } : {}),
});
const para = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

let editor: Editor | null = null;
// Tiptap meldet „create" erst nach dem Konstruktor (nächster Tick) — erst
// dann sind die onCreate-Hooks der Erweiterungen gelaufen, darunter die
// Silbentrennung.
const create = async (content: JSONContent) => {
  const instance = new Editor({ extensions, content });
  editor = instance;
  await new Promise<void>((resolve) => instance.on("create", () => resolve()));
  return instance;
};
afterEach(() => {
  editor?.destroy();
  editor = null;
});

const blockTypes = (e: Editor) => {
  const out: string[] = [];
  e.state.doc.forEach((node) => out.push(node.type.name));
  return out;
};

describe("Silbentrennung beim Laden (HyphenationOnLoad)", () => {
  const A = "Meine Großmutter erzählte uns Geschichten aus ihrer Kindheit am Bodensee.";
  const B = "Die Schreinerei meines Vaters lag gegenüber der Dorfkirche.";
  const C = "Sonntags gab es Pflaumenkuchen mit Schlagsahne.";

  it("erhält alle Absätze — keine Verschmelzung (Regression 2026-11-16)", async () => {
    const e = await create(doc(para(text(A)), para(text(B)), para(text(C))));
    expect(e.state.doc.childCount).toBe(3);
    const paragraphs: string[] = [];
    e.state.doc.forEach((node) => paragraphs.push(node.textContent.replace(SOFT_HYPHEN, "")));
    expect(paragraphs).toEqual([A, B, C]);
  });

  it("fügt weiche Trennstellen ein", async () => {
    const e = await create(doc(para(text(A)), para(text(B))));
    expect(e.state.doc.textContent).toMatch(SOFT_HYPHEN);
  });

  it("erhält Auszeichnungen und ihre Grenzen", async () => {
    const e = await create(
      doc(
        para(text("Die "), text("Schreinerwerkstatt", [{ type: "bold" }]), text(" meines Großvaters.")),
        para(text(B)),
      ),
    );
    expect(e.state.doc.childCount).toBe(2);
    const bold: string[] = [];
    e.state.doc.descendants((node) => {
      if (node.isText && node.marks.some((m) => m.type.name === "bold")) {
        bold.push((node.text ?? "").replace(SOFT_HYPHEN, ""));
      }
    });
    expect(bold.join("")).toBe("Schreinerwerkstatt");
    expect(e.state.doc.firstChild?.textContent.replace(SOFT_HYPHEN, "")).toBe(
      "Die Schreinerwerkstatt meines Großvaters.",
    );
  });

  it("lässt Listen, Zitate und Seitenumbrüche strukturell unverändert", async () => {
    const content = doc(
      para(text(A)),
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [para(text(B))] },
          { type: "listItem", content: [para(text(C))] },
        ],
      },
      { type: "pageBreak" },
      { type: "blockquote", content: [para(text(A)), para(text(B))] },
      para(text(C)),
    );
    const e = await create(content);
    expect(blockTypes(e)).toEqual(["paragraph", "bulletList", "pageBreak", "blockquote", "paragraph"]);
    expect(e.state.doc.child(1).childCount).toBe(2);
    expect(e.state.doc.child(3).childCount).toBe(2);
    expect(e.state.doc.lastChild?.textContent.replace(SOFT_HYPHEN, "")).toBe(C);
  });

  it("landet nicht in der Rückgängig-Historie", async () => {
    const e = await create(doc(para(text(A)), para(text(B))));
    expect(e.can().undo()).toBe(false);
  });
});

describe("Seitenumbruch einfügen (insertPageBreak)", () => {
  // Kurze Wörter: die Silbentrennung verändert sie nicht, Positionen bleiben lesbar.
  const base = () => create(doc(para(text("Eins zwei drei vier")), para(text("Fünf sechs"))));

  it("teilt den Absatz an der Cursor-Position", async () => {
    const e = await base();
    e.commands.setTextSelection(6); // nach „Eins "
    e.commands.insertPageBreak();
    expect(blockTypes(e)).toEqual(["paragraph", "pageBreak", "paragraph", "paragraph"]);
    expect(e.state.doc.child(0).textContent).toBe("Eins ");
    expect(e.state.doc.child(2).textContent).toBe("zwei drei vier");
    // Cursor steht am Anfang der rechten Hälfte.
    expect(e.state.selection.$from.parent.textContent).toBe("zwei drei vier");
    expect(e.state.selection.$from.parentOffset).toBe(0);
  });

  it("setzt den Umbruch am Absatzanfang davor", async () => {
    const e = await base();
    e.commands.setTextSelection(1);
    e.commands.insertPageBreak();
    expect(blockTypes(e)).toEqual(["pageBreak", "paragraph", "paragraph"]);
    expect(e.state.selection.$from.parent.textContent).toBe("Eins zwei drei vier");
  });

  it("setzt am Absatzende einen Umbruch und einen leeren Folgeabsatz", async () => {
    const e = await base();
    e.commands.focus("end");
    e.commands.insertPageBreak();
    expect(blockTypes(e)).toEqual(["paragraph", "paragraph", "pageBreak", "paragraph"]);
    expect(e.state.doc.lastChild?.content.size).toBe(0);
    expect(e.state.selection.$from.parent).toBe(e.state.doc.lastChild);
  });

  it("ersetzt markierten Text in einem Schritt durch den Umbruch (Regression 2026-11-16)", async () => {
    const e = await base();
    e.commands.setTextSelection({ from: 6, to: 11 }); // „zwei "
    e.commands.insertPageBreak();
    expect(blockTypes(e)).toEqual(["paragraph", "pageBreak", "paragraph", "paragraph"]);
    expect(e.state.doc.child(0).textContent).toBe("Eins ");
    expect(e.state.doc.child(2).textContent).toBe("drei vier");
    expect(e.state.selection.empty).toBe(true);
    // Ein einziger Rückgängig-Schritt stellt Text UND Struktur wieder her.
    e.commands.undo();
    expect(blockTypes(e)).toEqual(["paragraph", "paragraph"]);
    expect(e.state.doc.child(0).textContent).toBe("Eins zwei drei vier");
  });

  it("beendet ein Blockzitat am Cursor", async () => {
    const e = await create(
      doc({ type: "blockquote", content: [para(text("Eins zwei")), para(text("Drei vier"))] }),
    );
    e.commands.setTextSelection(7); // im ersten Zitat-Absatz nach „Eins "
    e.commands.insertPageBreak();
    // Hinter einem Zitat hält der Editor immer einen leeren Schlussabsatz
    // bereit (TrailingNode) — er gehört nicht zum Ergebnis des Befehls.
    expect(blockTypes(e).slice(0, 4)).toEqual(["blockquote", "pageBreak", "paragraph", "paragraph"]);
    expect(e.state.doc.child(0).childCount).toBe(1);
    expect(e.state.doc.child(0).textContent).toBe("Eins ");
    expect(e.state.doc.child(2).textContent).toBe("zwei");
    expect(e.state.selection.$from.parent.textContent).toBe("zwei");
    expect(e.state.doc.child(3).textContent).toBe("Drei vier");
  });
});
