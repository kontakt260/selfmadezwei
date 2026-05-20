import StarterKit from "@tiptap/starter-kit";
import { Extension } from "@tiptap/core";
import Paragraph from "@tiptap/extension-paragraph";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { ResolvedPos } from "@tiptap/pm/model";
import { PageBreakNode } from "./PageBreakNode";
import { PaginationDecorations } from "./PaginationDecorations";

// HTML-Paste-Sanitizer (Audit Bug 7): Pastes aus Word, Google Docs oder
// Webseiten enthalten häufig
//   <div><br></div>  (Word-Absatz-Trenner)
//   <p>Zeile 1<br>Zeile 2</p>  (Soft-Breaks innerhalb eines Absatzes)
//   <div>…<div>…</div></div>  (verschachtelte Block-Elemente)
// Daraus entsteht im Editor ein einziger riesiger Paragraph. Folge:
// Dreifachklick selektiert das gesamte Kapitel; Alignment-Klick richtet
// alles aus statt nur eines Absatzes. Wir normalisieren beim Einfügen:
// jeder Block-Trenner (<div>, <p>, <br>, </h1–h6>) erzeugt einen echten
// Paragraphen-Bruch.
const sanitizePastedHTML = (html: string): string => {
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Schritt 1: Block-<br> in <p>-Trenner umwandeln. Wir wickeln Geschwister
  // ZWISCHEN <br>-Tags in eigene <p>-Hüllen.
  doc.body.querySelectorAll("p, div").forEach((block) => {
    if (!block.querySelector(":scope > br")) return;
    const segments: Node[][] = [[]];
    block.childNodes.forEach((n) => {
      if (n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === "BR") {
        segments.push([]);
      } else {
        segments[segments.length - 1].push(n);
      }
    });
    if (segments.length <= 1) return;
    const replacement = doc.createDocumentFragment();
    for (const seg of segments) {
      // Leere Segmente → leerer Absatz (Word-Style "Enter-Enter" für Abstand)
      const p = doc.createElement("p");
      for (const n of seg) p.appendChild(n.cloneNode(true));
      replacement.appendChild(p);
    }
    block.replaceWith(replacement);
  });
  // Schritt 2: <div>-Wrapper aufbrechen (Word/Docs schachteln <div>s tief).
  // Wir ziehen Inhalt aus <div>s nach oben; verschachtelte <div>s werden
  // rekursiv flach gemacht. Ein <div>, das nur Text + Inlines enthält,
  // wird zu <p>. Ein <div>, das Block-Kinder enthält, wird durchgereicht.
  const flattenDivs = (root: Element) => {
    let div = root.querySelector("div");
    while (div) {
      const hasBlockChild = Array.from(div.children).some((c) =>
        /^(P|DIV|UL|OL|LI|H[1-6]|BLOCKQUOTE|PRE|TABLE)$/.test(c.tagName),
      );
      if (hasBlockChild) {
        // Block-Inhalt: <div> einfach ersetzen mit seinen Kindern
        const frag = doc.createDocumentFragment();
        while (div.firstChild) frag.appendChild(div.firstChild);
        div.replaceWith(frag);
      } else {
        // Nur Inline-Inhalt: zu <p> upgraden
        const p = doc.createElement("p");
        while (div.firstChild) p.appendChild(div.firstChild);
        div.replaceWith(p);
      }
      div = root.querySelector("div");
    }
  };
  flattenDivs(doc.body);
  return doc.body.innerHTML;
};

const PasteSanitizerPlugin = new Plugin({
  key: new PluginKey("paste-sanitizer"),
  props: {
    transformPastedHTML: (html) => sanitizePastedHTML(html),
  },
});

// Stored-Mark-Sync (Audit Bugs 6, 18): Nach Undo/Redo zeigt der Editor
// `state.storedMarks` an, die nicht mehr zum Cursor-Kontext passen. Die
// Toolbar liest `editor.isActive("bold")`, das diese gespeicherten Marks
// zuerst konsultiert — Button bleibt fälschlich aktiv. Wir prüfen nach
// jeder Transaktion, ob die storedMarks mit den tatsächlichen Marks am
// Selection-Head konsistent sind. Falls nicht, löschen wir storedMarks
// proaktiv. Folge: Toolbar-Aktiv-States spiegeln den realen Text-Zustand.
const StoredMarksSyncPlugin = new Plugin({
  key: new PluginKey("stored-marks-sync"),
  appendTransaction(transactions, _oldState, newState) {
    if (!transactions.some((tr) => tr.docChanged || tr.selectionSet)) return null;
    const stored = newState.storedMarks;
    if (!stored || stored.length === 0) return null;
    // Marks an der aktuellen Cursor-Position ermitteln. Bei einer
    // Cursor-Selektion sind die "echten" Marks die des Zeichens LINKS
    // vom Cursor (PM-Konvention: marks at $from.parent.maybeChild).
    const { $head } = newState.selection;
    const realMarks = $head.marks();
    // Vergleich: für jeden Stored-Mark muss ein passender echter Mark
    // mit identischem Type + Attrs existieren. Andernfalls clearen.
    const allMatch = stored.every((sm) =>
      realMarks.some((rm) => rm.type === sm.type && rm.eq(sm)),
    );
    if (allMatch) return null;
    return newState.tr.setStoredMarks(null);
  },
});

const TiptapStateHardening = Extension.create({
  name: "tiptapStateHardening",
  addProseMirrorPlugins() {
    return [PasteSanitizerPlugin, StoredMarksSyncPlugin];
  },
});

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
  TiptapStateHardening,
];
