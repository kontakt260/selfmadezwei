import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { editorExtensions } from "./extensions";
import type { SectionRemovalRequest } from "./ImageSectionNode";
import { canInsertImageSection, sectionIdsIn, sectionNextToCursor } from "./imageSectionRules";

// Das echte Schema des Editors, ohne die Seitenberechnung (braucht ein Layout)
// und ohne Silbentrennung, damit Positionen im Test eindeutig bleiben.
const extensions = editorExtensions.filter(
  (e) => e.name !== "paginationDecorations" && e.name !== "hyphenationOnLoad",
);

const A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const NEW = "cccccccc-cccc-4ccc-accc-cccccccccccc";

const para = (text?: string): JSONContent =>
  text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };
const section = (sectionId: string): JSONContent => ({ type: "imageSection", attrs: { sectionId } });
const pageBreak: JSONContent = { type: "pageBreak" };
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

let editor: Editor | null = null;
const create = (content: JSONContent) => {
  editor = new Editor({ extensions, content });
  return editor;
};
afterEach(() => {
  editor?.destroy();
  editor = null;
});

const cursor = (e: Editor, pos: number) => {
  e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, pos)));
};

/** Kurzform des Dokuments: Text, [id] für Abschnitte, --- für Umbrüche. */
const shape = (e: Editor) => {
  const out: string[] = [];
  e.state.doc.forEach((node) => {
    if (node.type.name === "imageSection") out.push(`[${(node.attrs.sectionId as string)[0]}]`);
    else if (node.type.name === "pageBreak") out.push("---");
    else if (node.type.name === "paragraph") out.push(node.textContent);
    else out.push(`<${node.type.name}>`);
  });
  return out;
};

const textAfterCursor = (e: Editor) => {
  const { $from } = e.state.selection;
  return $from.parent.textBetween($from.parentOffset, $from.parent.content.size);
};

describe("Bildabschnitt einfügen", () => {
  it("teilt den Absatz mitten in der Zeile, der Cursor steht dahinter", () => {
    const e = create(doc(para("Erster Teil zweiter Teil")));
    cursor(e, 1 + "Erster Teil".length);
    expect(e.commands.insertImageSection(NEW)).toBe(true);
    expect(shape(e)).toEqual(["Erster Teil", "[c]", "zweiter Teil"]);
    expect(textAfterCursor(e)).toBe("zweiter Teil");
  });

  it("zerreißt kein Wort: geteilt wird nach dem Wort", () => {
    const e = create(doc(para("Großmutter erzählte viel")));
    cursor(e, 1 + "Groß".length);
    e.commands.insertImageSection(NEW);
    expect(shape(e)).toEqual(["Großmutter", "[c]", "erzählte viel"]);
  });

  it("steht am Absatzanfang davor", () => {
    const e = create(doc(para("Eins"), para("Zwei")));
    cursor(e, 7);
    e.commands.insertImageSection(NEW);
    expect(shape(e)).toEqual(["Eins", "[c]", "Zwei"]);
    expect(textAfterCursor(e)).toBe("Zwei");
  });

  it("steht am Absatzende danach", () => {
    const e = create(doc(para("Eins"), para("Zwei")));
    cursor(e, 5);
    e.commands.insertImageSection(NEW);
    expect(shape(e)).toEqual(["Eins", "[c]", "Zwei"]);
  });

  it("legt am Kapitelende eine Zeile zum Weiterschreiben an", () => {
    const e = create(doc(para("Eins")));
    cursor(e, 5);
    e.commands.insertImageSection(NEW);
    expect(shape(e)).toEqual(["Eins", "[c]", ""]);
    expect(e.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(e.state.selection.$from.index(0)).toBe(2);
  });

  it("ersetzt eine leere Zeile", () => {
    const e = create(doc(para("Eins"), para(), para("Zwei")));
    cursor(e, 7);
    e.commands.insertImageSection(NEW);
    expect(shape(e)).toEqual(["Eins", "[c]", "Zwei"]);
  });

  it("funktioniert in einem leeren Kapitel", () => {
    const e = create(doc(para()));
    cursor(e, 1);
    e.commands.insertImageSection(NEW);
    expect(shape(e)).toEqual(["[c]", ""]);
  });

  it("steht in einer Liste nach dem ganzen Block", () => {
    const list: JSONContent = {
      type: "bulletList",
      content: [
        { type: "listItem", content: [para("Punkt eins")] },
        { type: "listItem", content: [para("Punkt zwei")] },
      ],
    };
    const e = create(doc(list, para("Danach")));
    cursor(e, 5);
    e.commands.insertImageSection(NEW);
    expect(shape(e)).toEqual(["<bulletList>", "[c]", "Danach"]);
  });

  it("steht in einem Zitat nach dem ganzen Block", () => {
    const quote: JSONContent = { type: "blockquote", content: [para("Ein Zitat")] };
    const e = create(doc(quote));
    cursor(e, 4);
    e.commands.insertImageSection(NEW);
    expect(shape(e)).toEqual(["<blockquote>", "[c]", ""]);
  });

  it("nimmt bei einer Markierung das Ende der Markierung", () => {
    const e = create(doc(para("Eins zwei drei")));
    e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, 1, 10)));
    e.commands.insertImageSection(NEW);
    expect(shape(e)).toEqual(["Eins zwei", "[c]", "drei"]);
  });

  it("ein Schritt Rückgängig entfernt den neuen Abschnitt wieder", () => {
    const e = create(doc(para("Erster Teil zweiter Teil")));
    cursor(e, 12);
    e.commands.insertImageSection(NEW);
    e.commands.undo();
    expect(shape(e)).toEqual(["Erster Teil zweiter Teil"]);
  });
});

describe("Trennung zwischen zwei Abschnitten", () => {
  it("sperrt das Werkzeug direkt hinter einem Abschnitt", () => {
    const e = create(doc(section(A), para("Text")));
    cursor(e, 2);
    expect(canInsertImageSection(e.state)).toBe(false);
    expect(e.commands.insertImageSection(NEW)).toBe(false);
  });

  it("sperrt das Werkzeug direkt vor einem Abschnitt", () => {
    const e = create(doc(para("Text"), section(A), para()));
    cursor(e, 5);
    expect(canInsertImageSection(e.state)).toBe(false);
  });

  it("sperrt die leere Zeile zwischen zwei Abschnitten", () => {
    const e = create(doc(section(A), para(), section(B), para()));
    cursor(e, 2);
    expect(canInsertImageSection(e.state)).toBe(false);
  });

  it("ein Seitenumbruch zählt nicht als Zeile", () => {
    const e = create(doc(section(A), pageBreak, para("Text")));
    cursor(e, 3);
    expect(canInsertImageSection(e.state)).toBe(false);
  });

  it("mitten im Absatz zwischen zwei Abschnitten ist es erlaubt", () => {
    const e = create(doc(section(A), para("Eins zwei"), section(B), para()));
    cursor(e, 6);
    expect(canInsertImageSection(e.state)).toBe(true);
  });

  it("setzt eine Zeile, wenn Abschnitte aufeinandertreffen würden", () => {
    const e = create(doc(section(A), para("x"), para("y"), section(B), para()));
    e.view.dispatch(e.state.tr.delete(1, 7));
    expect(shape(e)).toEqual(["[a]", "", "[b]", ""]);
  });

  it("behält die letzte Zeile, wenn ihr Text gelöscht wird", () => {
    const e = create(doc(section(A), para("Zeile"), section(B), para()));
    e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, 2, 7)));
    e.commands.deleteSelection();
    expect(shape(e)).toEqual(["[a]", "", "[b]", ""]);
  });

  it("erlaubt keinen Abschnitt doppelt", () => {
    const e = create(doc(section(A), para("Text")));
    const node = e.state.schema.nodes.imageSection.create({ sectionId: A });
    e.view.dispatch(e.state.tr.insert(e.state.doc.content.size, node));
    expect(sectionIdsIn(e.state.doc)).toEqual([A]);
  });

  it("erlaubt keinen Abschnitt in Listen oder Zitaten", () => {
    const e = create(doc(para("Text")));
    const { schema } = e.state;
    const inQuote = schema.nodes.blockquote.contentMatch.matchType(schema.nodes.imageSection);
    const inItem = schema.nodes.listItem.contentMatch.matchType(schema.nodes.imageSection);
    expect(inQuote).toBeNull();
    expect(inItem).toBeNull();
  });

  it("übernimmt beim Einfügen aus HTML keinen Abschnitt", () => {
    const e = create(doc(para("Text")));
    e.commands.insertContentAt(5, `<p>Neu</p><div data-image-section="${A}"></div>`);
    expect(sectionIdsIn(e.state.doc)).toEqual([]);
  });
});

describe("Abschnitt entfernen", () => {
  const withGuard = (content: JSONContent) => {
    const e = create(content);
    const request = vi.fn<(r: SectionRemovalRequest) => void>();
    e.storage.imageSection.onRemovalRequest = request;
    return { e, request };
  };
  const nextTask = () => new Promise<void>((resolve) => queueMicrotask(resolve));

  it("findet den Abschnitt direkt vor und hinter dem Cursor", () => {
    // "Eins" belegt 0 bis 6, der Abschnitt 6 bis 7, "Zwei" beginnt bei 8.
    const e = create(doc(para("Eins"), section(A), para("Zwei")));
    cursor(e, 8);
    expect(sectionNextToCursor(e.state, -1)).toBe(6);
    expect(sectionNextToCursor(e.state, 1)).toBeNull();
    cursor(e, 5);
    expect(sectionNextToCursor(e.state, 1)).toBe(6);
    expect(sectionNextToCursor(e.state, -1)).toBeNull();
    cursor(e, 9);
    expect(sectionNextToCursor(e.state, -1)).toBeNull();
  });

  it("die Zurücktaste fragt nach und ändert ohne Bestätigung nichts", async () => {
    const { e, request } = withGuard(doc(para("Eins"), section(A), para("Zwei")));
    cursor(e, 8);
    e.commands.keyboardShortcut("Backspace");
    await nextTask();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0].sectionIds).toEqual([A]);
    expect(shape(e)).toEqual(["Eins", "[a]", "Zwei"]);
  });

  it("nach der Bestätigung ist der Abschnitt weg, Rückgängig holt ihn zurück", async () => {
    const { e, request } = withGuard(doc(para("Eins"), section(A), para("Zwei")));
    cursor(e, 5);
    e.commands.keyboardShortcut("Delete");
    await nextTask();
    request.mock.calls[0][0].confirm();
    expect(shape(e)).toEqual(["Eins", "Zwei"]);
    e.commands.undo();
    expect(shape(e)).toEqual(["Eins", "[a]", "Zwei"]);
  });

  it("die leere Zeile vom Einfügen verschwindet mit dem Abschnitt", async () => {
    const { e, request } = withGuard(doc(para("Eins"), section(A), para()));
    cursor(e, 8);
    e.commands.keyboardShortcut("Backspace");
    await nextTask();
    request.mock.calls[0][0].confirm();
    expect(shape(e)).toEqual(["Eins"]);
  });

  it("das Kapitel behält immer eine Zeile", async () => {
    const { e, request } = withGuard(doc(section(A), para()));
    cursor(e, 2);
    e.commands.keyboardShortcut("Backspace");
    await nextTask();
    request.mock.calls[0][0].confirm();
    expect(shape(e)).toEqual([""]);
  });

  it("fragt auch beim Löschen einer Markierung über den Abschnitt", async () => {
    const { e, request } = withGuard(doc(para("Eins"), section(A), para("Zwei")));
    e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, 3, 9)));
    e.commands.deleteSelection();
    await nextTask();
    expect(request).toHaveBeenCalledTimes(1);
    expect(shape(e)).toEqual(["Eins", "[a]", "Zwei"]);
    request.mock.calls[0][0].confirm();
    expect(sectionIdsIn(e.state.doc)).toEqual([]);
  });

  it("eine veraltete Bestätigung ändert nichts", async () => {
    const { e, request } = withGuard(doc(para("Eins"), section(A), para("Zwei")));
    cursor(e, 8);
    e.commands.keyboardShortcut("Backspace");
    await nextTask();
    e.commands.insertContentAt(2, "x");
    request.mock.calls[0][0].confirm();
    expect(sectionIdsIn(e.state.doc)).toEqual([A]);
  });

  it("entfernt mit bestätigtem Befehl ohne weitere Rückfrage", () => {
    const { e, request } = withGuard(doc(para("Eins"), section(A), para("Zwei")));
    e.commands.removeImageSection(A);
    expect(request).not.toHaveBeenCalled();
    expect(shape(e)).toEqual(["Eins", "Zwei"]);
  });
});
