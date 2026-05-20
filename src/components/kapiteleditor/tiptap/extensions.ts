import StarterKit from "@tiptap/starter-kit";
import { Extension } from "@tiptap/core";
import Paragraph from "@tiptap/extension-paragraph";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { Plugin } from "@tiptap/pm/state";
import type { ResolvedPos } from "@tiptap/pm/model";
import { PageBreakNode } from "./PageBreakNode";
import { PaginationDecorations } from "./PaginationDecorations";

// Listen sind in Blockquotes nicht erlaubt (Stil-Konsistenz: Blockzitat
// soll reiner Text bleiben, keine geschachtelten Aufzählungen). Wir
// fangen Cmd/Ctrl+Shift+7 (ordered) und Cmd/Ctrl+Shift+8 (bullet) ab,
// wenn der Cursor in einer Blockquote sitzt — sowie die Markdown-Input-
// Rules ("- " / "1. "), die die Listen automatisch starten würden.
const isInBlockquote = ($pos: ResolvedPos) => {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === "blockquote") return true;
  }
  return false;
};
const NoListInBlockquote = Extension.create({
  name: "noListInBlockquote",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleKeyDown(view, event) {
            const isListShortcut =
              (event.metaKey || event.ctrlKey) &&
              event.shiftKey &&
              (event.key === "7" || event.key === "8");
            if (!isListShortcut) return false;
            const { $from } = view.state.selection;
            if (!isInBlockquote($from)) return false;
            event.preventDefault();
            return true;
          },
          handleTextInput(view, from, to, text) {
            // Markdown-Input-Rules ("- " oder "1. ") starten Listen.
            // In Blockquotes wollen wir das nicht — wir lassen das
            // Whitespace-Zeichen normal eingetippt werden, aber TipTap's
            // Input-Rule schluckt es danach und ersetzt es durch die Liste.
            // Da `handleTextInput` VOR der Input-Rule läuft, können wir
            // hier nur die Selektion prüfen und entscheiden, ob wir das
            // Standardverhalten lassen oder unterbinden. Praktisch: wir
            // entdecken hier nicht zuverlässig den Pattern-Match — die
            // Input-Rule selbst muss kontextsensitiv sein. Wir verlassen
            // uns deshalb auf eine separate Filterung via appendTransaction
            // unten.
            void view; void from; void to; void text;
            return false;
          },
          // Filter-Transaktion: nach jedem Step prüfen, ob eine Liste
          // INNERHALB einer Blockquote entstanden ist (z.B. via Paste
          // oder Input-Rule). Falls ja, Transaktion verwerfen.
        },
        appendTransaction(transactions, oldState, newState) {
          const docChanged = transactions.some((tr) => tr.docChanged);
          if (!docChanged) return null;
          // Suche nach List-Nodes innerhalb von Blockquotes im neuen Doc.
          let foundListInBq = false;
          newState.doc.descendants((node, _pos, parent) => {
            if (foundListInBq) return false;
            if (
              parent?.type.name === "blockquote" &&
              (node.type.name === "bulletList" || node.type.name === "orderedList")
            ) {
              foundListInBq = true;
              return false;
            }
            return true;
          });
          if (!foundListInBq) return null;
          // Liste in BQ entdeckt → Rollback auf oldState.doc.
          const tr = newState.tr.replaceWith(0, newState.doc.content.size, oldState.doc.content);
          tr.setMeta("addToHistory", false);
          return tr;
        },
      }),
    ];
  },
});

// Hinweis: Underline ist seit StarterKit v3 bereits enthalten. Kein
// separater Import nötig (würde sonst „Duplicate extension names"-Warning
// werfen).

// Paragraph mit zusätzlichen Druck-Attributen (Zeilenabstand, Einrückung)
const ParagraphWithLayout = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      lineHeight: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-line-height"),
        renderHTML: (attrs) =>
          attrs.lineHeight ? { "data-line-height": attrs.lineHeight } : {},
      },
      indent: {
        default: 0,
        parseHTML: (el) => {
          const v = el.getAttribute("data-indent");
          return v ? parseInt(v, 10) : 0;
        },
        renderHTML: (attrs) => {
          const lvl = (attrs.indent as number) ?? 0;
          if (!lvl) return {};
          return {
            "data-indent": String(lvl),
            style: `padding-left: ${lvl * 1.5}em`,
          };
        },
      },
    };
  },
});

export const editorExtensions = [
  StarterKit.configure({
    heading: false,
    horizontalRule: false,
    codeBlock: false,
    link: false,
    paragraph: false,
    blockquote: { HTMLAttributes: { class: "a5-blockquote" } },
    bulletList: { HTMLAttributes: { class: "a5-ul" } },
    orderedList: { HTMLAttributes: { class: "a5-ol" } },
  }),
  ParagraphWithLayout,
  TextAlign.configure({
    types: ["paragraph"],
    alignments: ["left", "center", "right", "justify"],
    defaultAlignment: "justify",
  }),
  Placeholder.configure({
    placeholder: "Erzähle hier deine Geschichte …",
    emptyEditorClass: "is-editor-empty",
  }),
  PageBreakNode,
  PaginationDecorations,
  NoListInBlockquote,
];
