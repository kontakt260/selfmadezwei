import StarterKit from "@tiptap/starter-kit";
import Paragraph from "@tiptap/extension-paragraph";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { PageBreakNode } from "./PageBreakNode";

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
  Underline,
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
];
