import { afterEach, describe, expect, it } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { editorExtensions } from "./extensions";
import { hyphenationKey, HYPHENATION_REFRESH, isHyphenationPoint } from "./Hyphenation";
import { hyphenationPoints, loadHyphenation } from "@/lib/hyphenation";

// Editor mit dem echten Schema des Kapitel-Editors. Die Pagination-
// Erweiterung misst das gerenderte Layout (ResizeObserver, Seitenrahmen) —
// in jsdom gibt es kein Layout, deshalb bleibt sie hier außen vor.
const extensions = editorExtensions.filter((e) => e.name !== "paginationDecorations");

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

describe("Silbentrennung als Anzeige (PROJ-35)", () => {
  const A = "Meine Großmutter erzählte uns Geschichten aus ihrer Kindheit am Bodensee.";
  const B = "Die Schreinerei meines Vaters lag gegenüber der Dorfkirche.";
  const C = "Sonntags gab es Pflaumenkuchen mit Schlagsahne.";

  // Das Wörterbuch lädt einmal, danach trennt das Plugin das ganze Kapitel.
  const ready = async (content: JSONContent) => {
    const e = await create(content);
    await loadHyphenation();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return e;
  };
  /** Trennstellen als Abstand vom Anfang des n-ten Absatzes im Dokument. */
  const shown = (e: Editor, index: number) => {
    let start = -1;
    let end = -1;
    let n = 0;
    e.state.doc.descendants((node, pos) => {
      if (!node.isTextblock) return true;
      if (n === index) {
        start = pos + 1;
        end = pos + node.nodeSize;
      }
      n += 1;
      return false;
    });
    const set = hyphenationKey.getState(e.state)!.set;
    return set
      .find(start, end)
      .map((d) => d.from - start)
      .sort((a, b) => a - b);
  };
  const expected = (t: string) => hyphenationPoints(t);

  it("schreibt keine Trennzeichen in den Text und zeigt die Trennstellen daneben", async () => {
    const e = await ready(doc(para(text(A)), para(text(B)), para(text(C))));
    expect(e.state.doc.textContent).not.toContain("­");
    expect(shown(e, 0)).toEqual(expected(A));
    expect(shown(e, 1)).toEqual(expected(B));
    expect(shown(e, 0).length).toBeGreaterThan(0);
  });

  it("trennt auch in Listen und Zitaten und lässt die Struktur unverändert", async () => {
    const content = doc(
      para(text(A)),
      { type: "bulletList", content: [{ type: "listItem", content: [para(text(B))] }] },
      { type: "pageBreak" },
      { type: "blockquote", content: [para(text(A))] },
      para(text(C)),
    );
    const e = await ready(content);
    expect(blockTypes(e)).toEqual(["paragraph", "bulletList", "pageBreak", "blockquote", "paragraph"]);
    expect(shown(e, 1)).toEqual(expected(B));
    expect(shown(e, 2)).toEqual(expected(A));
  });

  it("trennt Wörter mit Auszeichnung wie alle anderen", async () => {
    const e = await ready(
      doc(para(text("Die "), text("Schreinerwerkstatt", [{ type: "bold" }]), text(" meines Großvaters."))),
    );
    expect(shown(e, 0)).toEqual(expected("Die Schreinerwerkstatt meines Großvaters."));
  });

  it("trennt zentrierten und rechtsbündigen Text nie und passt sich beim Wechsel sofort an", async () => {
    const e = await ready(doc(para(text(A))));
    e.commands.setTextSelection(3);
    e.commands.setTextAlign("center");
    expect(shown(e, 0)).toEqual([]);
    e.commands.setTextAlign("right");
    expect(shown(e, 0)).toEqual([]);
    e.commands.setTextAlign("left");
    expect(shown(e, 0)).toEqual(expected(A));
  });

  it("trennt beim Tippen den geänderten Absatz neu, das letzte Wort bleibt ganz", async () => {
    const e = await ready(doc(para(text("Wir besuchten die Großmutter")), para(text(B))));
    const before = shown(e, 0);
    expect(before).toEqual(expected("Wir besuchten die Großmutter"));
    e.commands.setTextSelection(e.state.doc.child(0).nodeSize - 1);
    e.commands.insertContent(" heute");
    expect(shown(e, 0)).toEqual(expected("Wir besuchten die Großmutter heute"));
    expect(shown(e, 0).length).toBe(before.length + 1);
    expect(shown(e, 1)).toEqual(expected(B));
  });

  it("wartet während einer Wort-Eingabe mit Autokorrektur und trennt danach", async () => {
    const e = await ready(doc(para(text("Wir besuchten die Großmutter"))));
    const before = shown(e, 0);
    const end = e.state.doc.child(0).nodeSize - 1;
    e.view.dispatch(e.state.tr.insertText(" heute", end).setMeta("composition", 1));
    expect(shown(e, 0)).toEqual(before);
    const deferred = hyphenationKey.getState(e.state)!.deferred;
    expect(deferred).toBe(0);
    e.view.dispatch(e.state.tr.setMeta(HYPHENATION_REFRESH, deferred));
    expect(shown(e, 0)).toEqual(expected("Wir besuchten die Großmutter heute"));
    expect(hyphenationKey.getState(e.state)!.deferred).toBeNull();
  });

  it("nimmt keine Trennzeichen aus eingefügtem Text auf", async () => {
    // jsdom kennt kein Einfügen über die Zwischenablage, deshalb direkt die Filter.
    const e = await ready(doc(para(text("Start"))));
    const plugin = hyphenationKey.get(e.state)!;
    const pastedText = plugin.props.transformPastedText!.call(plugin, " Groß­mut­ter", false, e.view);
    expect(pastedText).toBe(" Großmutter");
    const { schema } = e.state;
    const slice = new Slice(
      Fragment.from(
        schema.node("paragraph", null, [
          schema.text("Kar­tof"),
          schema.text("­fel", [schema.marks.bold.create()]),
        ]),
      ),
      0,
      0,
    );
    const pasted = plugin.props.transformPasted!.call(plugin, slice, e.view, false);
    expect(pasted.content.textBetween(0, pasted.content.size)).toBe("Kartoffel");
    expect(pasted.content.firstChild?.lastChild?.marks.map((m) => m.type.name)).toEqual(["bold"]);
    const clean = new Slice(Fragment.from(schema.text("Ohne")), 0, 0);
    expect(plugin.props.transformPasted!.call(plugin, clean, e.view, false)).toBe(clean);
  });

  it("landet nicht in der Rückgängig-Historie", async () => {
    const e = await ready(doc(para(text(A)), para(text(B))));
    expect(e.can().undo()).toBe(false);
  });

  it("meldet dem Seiten-Takt die Trennstellen", async () => {
    const e = await ready(doc(para(text(A))));
    const [first] = shown(e, 0);
    expect(isHyphenationPoint(e.state, 1 + first)).toBe(true);
    expect(isHyphenationPoint(e.state, 1 + first + 1)).toBe(false);
  });

  it("macht aus getippten geschützten Leerzeichen normale (Chrome vor einer Trennmarkierung)", async () => {
    const e = await ready(doc(para(text("Großmutter erzählte"))));
    e.view.dispatch(e.state.tr.insertText("Weiter ", 1));
    expect(e.state.doc.textContent).toBe("Weiter Großmutter erzählte");
    // Rückgängig nimmt das Getippte samt Korrektur in einem Schritt zurück.
    e.commands.undo();
    expect(e.state.doc.textContent).toBe("Großmutter erzählte");
  });

  it("lässt geschützte Leerzeichen am Absatzende stehen, bis weitergeschrieben wird", async () => {
    // Bei `white-space: normal` wäre ein normales Leerzeichen am Ende unsichtbar.
    const e = await ready(doc(para(text("Hallo"))));
    e.view.dispatch(e.state.tr.insertText(" ", 6));
    expect(e.state.doc.textContent).toBe("Hallo ");
    e.view.dispatch(e.state.tr.insertText("W", 7));
    expect(e.state.doc.textContent).toBe("Hallo W");
    // Doppelte Leerzeichen und der Absatzanfang bleiben ebenso, wie der Browser sie setzt.
    e.view.dispatch(e.state.tr.insertText(" ", 7));
    e.view.dispatch(e.state.tr.insertText(" ", 1));
    expect(e.state.doc.textContent).toBe(" Hallo  W");
  });

  it("lässt eingefügte geschützte Leerzeichen stehen, auch wenn danach daneben getippt wird", async () => {
    const e = await ready(doc(para(text("Seite"))));
    e.view.dispatch(e.state.tr.insertText(" S. 12", 6).setMeta("uiEvent", "paste"));
    expect(e.state.doc.textContent).toBe("Seite S. 12");
    e.view.dispatch(e.state.tr.insertText("n", 6));
    expect(e.state.doc.textContent).toBe("Seiten S. 12");
  });

  it("ändert während einer Wort-Eingabe nichts und holt die Korrektur danach nach", async () => {
    const e = await ready(doc(para(text("Seite"))));
    e.view.dispatch(e.state.tr.insertText("und ", 1).setMeta("composition", 1));
    expect(e.state.doc.textContent).toBe("und Seite");
    e.view.dispatch(e.state.tr.setMeta(HYPHENATION_REFRESH, 0));
    expect(e.state.doc.textContent).toBe("und Seite");
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
