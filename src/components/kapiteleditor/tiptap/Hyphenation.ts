import { Extension } from "@tiptap/core";
import { hyphenateText } from "@/lib/hyphenation";

// One-shot Hyphenation-Pass (Audit Bugs 10, 16, 2026-05-21).
//
// Beim Editor-Mount läuft genau EIN Hypher-Pass über das geladene
// Dokument. Jedes Text-Knoten-Run wird in seine soft-hyphenierte
// Version umgewandelt (­ als unsichtbare Bruchstelle).
//
// Warum nur EINMAL beim Mount?
//   - Hypher pro Keystroke wäre verschwenderisch und würde Cursor-
//     Position + Selektion über die Soft-Hyphen-Längenänderung
//     verschieben (PM-Offsets ändern sich bei jedem Char-Insert).
//   - Browser-natives `hyphens: auto` greift für FRISCH GETIPPTE
//     Wörter weiterhin als Fallback (deutsche Wörterbuch im Browser).
//   - Soft-Hyphens, die der User einmal beim Laden injiziert bekommt,
//     bleiben im Save erhalten — sie sind harmlos: kein PDF-Renderer
//     stolpert über ­, alle gängigen Layout-Engines respektieren
//     sie als bevorzugte Bruchstellen.
//
// Nicht-Ziele:
//   - Live-Re-Hyphenation während des Tippens (riskant + unnötig).
//   - Hyphenation in Überschriften (CSS hyphens: none auf h1/h2 — Bug 4).
//   - Hyphenation in Blockzitaten (visuell zu unruhig in schmalen Spalten).

export const HyphenationOnLoad = Extension.create({
  name: "hyphenationOnLoad",
  onCreate() {
    const { editor } = this;
    if (!editor) return;
    const { state } = editor;
    const tr = state.tr;
    // Ersetzungen erst sammeln, dann von HINTEN nach vorne anwenden.
    // `descendants` liefert Positionen des ursprünglichen Dokuments;
    // jede Ersetzung verändert aber die Dokumentlänge (Soft-Hyphens
    // kommen hinzu). Vorwärts angewendet zeigten die Positionen späterer
    // Textknoten auf falsche Stellen — der Ersetzungsbereich überdeckte
    // dann die Absatzgrenze davor, und `insertText` verschmolz zwei
    // Absätze zu einem (Bug 2026-11-15: bei jedem Öffnen eines Kapitels
    // gingen Absatzumbrüche verloren, 13 → 2 → 1 Absätze). Rückwärts
    // bleiben alle noch nicht bearbeiteten Positionen gültig.
    const replacements: Array<{ from: number; to: number; text: string }> = [];
    state.doc.descendants((node, pos, parent) => {
      if (!node.isText || !node.text) return;
      // Überschriften überspringen — typografisch dürfen Titel nicht
      // automatisch getrennt werden (Bug 4). Unsere Editor-Body hat
      // aktuell zwar keine Headings, aber wir filtern defensiv.
      const parentName = parent?.type.name;
      if (parentName === "heading") return;
      // Blockzitate überspringen — Italic + Hyphens wirkt unruhig.
      // Wir lassen den Browser via `hyphens: auto` (Default-CSS) das
      // Nötigste übernehmen.
      if (parentName === "blockquote") return;
      const hyphenated = hyphenateText(node.text);
      if (hyphenated === node.text) return;
      replacements.push({ from: pos, to: pos + node.nodeSize, text: hyphenated });
    });
    if (replacements.length === 0) return;
    for (let i = replacements.length - 1; i >= 0; i--) {
      const { from, to, text } = replacements[i];
      // Marks des ersetzten Textknotens explizit übernehmen.
      const marks = state.doc.resolve(from).marksAcross(state.doc.resolve(to)) ?? [];
      tr.replaceWith(from, to, state.schema.text(text, marks));
    }
    // Soft-Hyphens dürfen nicht in der Undo-History landen — sie sind
    // rein typografisch und sollen für den User unsichtbar bleiben.
    tr.setMeta("addToHistory", false);
    editor.view.dispatch(tr);
  },
});
