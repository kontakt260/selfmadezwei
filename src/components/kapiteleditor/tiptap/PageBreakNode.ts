import { Node, mergeAttributes } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: {
      /**
       * Fügt einen Seitenumbruch an der aktuellen Cursor-Position ein.
       *
       * Word-/Docs-konformes Verhalten:
       * - Cursor mitten im Absatz → Absatz wird am Cursor gesplittet, `<hr>`
       *   landet zwischen den beiden Hälften, Cursor an den Anfang der
       *   rechten Hälfte
       * - Cursor am Anfang eines Blocks → `<hr>` davor, Cursor bleibt im Block
       * - Cursor am Ende eines Blocks → `<hr>` danach, Cursor springt in einen
       *   neuen leeren Absatz dahinter (kein Geist-Placeholder, weil
       *   extensions.ts den Placeholder auf Blöcken nach `<hr>` unterdrückt)
       * - Zwei aufeinanderfolgende Brüche → echt leere Seite dazwischen
       *   (Engine rendert einen leeren Frame mit Seitenzahl)
       */
      insertPageBreak: () => ReturnType;
    };
  }
}

export const PageBreakNode = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: false,
  draggable: false,

  parseHTML() {
    return [{ tag: "hr.a5-page-break" }, { tag: 'div[data-type="page-break"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "hr",
      mergeAttributes(HTMLAttributes, {
        "data-type": "page-break",
        class: "a5-page-break",
      }),
    ];
  },

  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ state, dispatch, view }) => {
          const { selection, schema } = state;
          const pageBreakType = schema.nodes.pageBreak;
          const paragraphType = schema.nodes.paragraph;
          if (!pageBreakType || !paragraphType) return false;

          const { $from, $to } = selection;
          if (!selection.empty) {
            // Bei Range-Selektion: Range löschen, dann am Caret einfügen.
            // ProseMirror's deleteSelection wandelt $from/$to in eine Empty-Sel.
            // Wir delegieren auf einen frischen Versuch mit empty Selection.
            const tr = state.tr.deleteSelection();
            if (dispatch) dispatch(tr);
            return true;
          }

          // Sind wir in einem Text-Block (Absatz, Heading, etc.)?
          const inTextBlock = $from.parent.isTextblock;

          let tr = state.tr;
          let cursorPos: number | null = null;

          if (inTextBlock) {
            const atStart = $from.parentOffset === 0;
            const atEnd = $from.parentOffset === $from.parent.content.size;

            if (atStart) {
              // Cursor am Block-Anfang: pageBreak DAVOR einfügen.
              const before = $from.before();
              tr = tr.insert(before, pageBreakType.create());
              // Cursor bleibt im ursprünglichen Block — Position verschiebt
              // sich um die nodeSize des pageBreak (1).
              cursorPos = selection.from + 1;
            } else if (atEnd) {
              // Cursor am Block-Ende: pageBreak DANACH + leerer Folge-Absatz.
              const after = $from.after();
              tr = tr.insert(after, [pageBreakType.create(), paragraphType.create()]);
              // Cursor in den neuen Absatz hinein (after + pb.nodeSize=1 + paraOpen=1)
              cursorPos = after + 2;
            } else {
              // Cursor mitten im Block: Block am Cursor splitten, dann
              // pageBreak ZWISCHEN die beiden Hälften setzen.
              tr = tr.split($from.pos);
              // Nach dem Split: insertPos = $from.pos + 1 (Klammer-Skip)
              const insertPos = $from.pos + 1;
              tr = tr.insert(insertPos, pageBreakType.create());
              // Cursor an den Anfang der rechten Hälfte (insertPos + pb.nodeSize=1 + paraOpen=1)
              cursorPos = insertPos + 2;
            }
          } else {
            // Außerhalb eines Text-Blocks (z. B. zwischen Blöcken): einfach
            // pageBreak + leerer Folge-Absatz an aktueller Position einsetzen.
            tr = tr.insert(selection.from, [pageBreakType.create(), paragraphType.create()]);
            cursorPos = selection.from + 2;
          }

          if (cursorPos !== null) {
            const resolved = tr.doc.resolve(Math.min(cursorPos, tr.doc.content.size));
            tr = tr.setSelection(TextSelection.near(resolved, 1)).scrollIntoView();
          }

          // scrollIntoView() in der Transaktion (s.o.) reicht — der Editor
          // bringt die neue Cursor-Position natürlich in den Viewport. Kein
          // manueller smooth-scrollTo nötig (würde sich mit dem
          // browser-eigenen Scroll überlagern und „abschnittsweise" wirken).
          if (dispatch) dispatch(tr);
          // Verwendet view nur für Typprüfung — kein Laufzeit-Effekt nötig.
          void view;

          return true;
        },
    };
  },
});
