import { Node, mergeAttributes } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
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

          // PROJ-5 Bug 2026-05-21: PageBreak innerhalb eines Blockquote.
          // Anforderung: das Zitat muss am Cursor enden; alles ab Cursor
          // (rechte Hälfte des aktuellen Absatzes + Folge-Absätze des
          // Zitats) wird zu normalen Absätzen außerhalb des Zitats, dazwischen
          // sitzt der PageBreak.
          let blockquoteDepth = -1;
          for (let d = $from.depth - 1; d >= 0; d--) {
            if ($from.node(d).type.name === "blockquote") {
              blockquoteDepth = d;
              break;
            }
          }

          if (blockquoteDepth >= 0 && $from.parent.isTextblock) {
            const bqBefore = $from.before(blockquoteDepth);
            const bqAfter = $from.after(blockquoteDepth);
            const bqEnd = $from.end(blockquoteDepth);
            const bqNode = $from.node(blockquoteDepth);
            const atFirstParaStart =
              $from.parentOffset === 0 && $from.index(blockquoteDepth) === 0;
            const atLastParaEnd =
              $from.parentOffset === $from.parent.content.size &&
              $from.index(blockquoteDepth) === bqNode.childCount - 1;

            let tr = state.tr;
            let cursorPos: number;

            if (atFirstParaStart) {
              // PageBreak DAVOR — Zitat unverändert, Cursor bleibt im
              // ersten Absatz des Zitats.
              tr = tr.insert(bqBefore, pageBreakType.create());
              cursorPos = selection.from + 1;
            } else if (atLastParaEnd) {
              // PageBreak + leerer Folge-Absatz DANACH — Zitat unverändert,
              // Cursor in den neuen leeren Absatz.
              tr = tr.insert(bqAfter, [
                pageBreakType.create(),
                paragraphType.create(),
              ]);
              cursorPos = bqAfter + 2;
            } else {
              // Mitten im Zitat: rechte Hälfte aus dem Zitat herausziehen.
              //
              // Vor: blockquote(...para_left, para_cursor[A|B], para_right...)
              // Nach: blockquote(...para_left, para_cursor[A]), pageBreak,
              //       para_cursor[B], para_right..., (Cursor am Anfang von [B])
              //
              // Schritt 1: rechte Slice aus dem Zitat als Fragment einsammeln.
              const rightSlice = state.doc.slice($from.pos, bqEnd, true);

              // Schritt 2: rechten Bereich INNERHALB des Zitats löschen.
              tr = tr.delete($from.pos, bqEnd);

              // Schritt 3: nach dem Zitat einfügen — pageBreak + die Inhalte
              // des rightSlice (ohne blockquote-Wrapper, weil wir den
              // Slice innerhalb des Zitats genommen haben).
              //
              // rightSlice.content ist eine Fragment-Liste mit
              // openStart > 0 (Cut innerhalb eines Absatzes). Wir bauen
              // ein neues Fragment, in dem die erste Inhalts-Sequenz in
              // einen neuen Paragraph eingeschlossen wird, gefolgt von
              // den vollständigen restlichen Paragraphen.
              const newAfter = tr.mapping.map(bqAfter);
              const childCount = rightSlice.content.childCount;
              const liftedNodes = [];
              for (let i = 0; i < childCount; i++) {
                const child = rightSlice.content.child(i);
                if (i === 0 && rightSlice.openStart > 0) {
                  // child ist hier ein bereits-offen-gestarteter Paragraph
                  // (PM gibt ihn als Wrapping-Node zurück, dessen Inhalt
                  // erst ab dem Cut-Punkt beginnt). Wir übernehmen ihn 1:1.
                  liftedNodes.push(child);
                } else {
                  liftedNodes.push(child);
                }
              }
              tr = tr.insert(
                newAfter,
                Fragment.from([pageBreakType.create(), ...liftedNodes]),
              );
              cursorPos = newAfter + 2; // hinter pageBreak + paragraph-open
            }

            const resolved = tr.doc.resolve(
              Math.min(cursorPos, tr.doc.content.size),
            );
            tr = tr
              .setSelection(TextSelection.near(resolved, 1))
              .scrollIntoView();
            if (dispatch) dispatch(tr);
            void view;
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
