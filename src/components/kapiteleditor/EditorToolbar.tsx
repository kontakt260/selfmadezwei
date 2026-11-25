"use client";

import { useRef } from "react";
import type React from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  ScrollText,
  Underline as UnderlineIcon,
  Undo2,
  IndentDecrease,
  IndentIncrease,
} from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReadOnlyScope } from "@/components/ReadOnlyScope";
import { MAX_IMAGES_PER_CHAPTER } from "@/lib/kapiteleditor/image-sections";
import { cn } from "@/lib/utils";
import { canInsertImageSection } from "./tiptap/imageSectionRules";

// Verhindert, dass der Browser beim Klick auf ein Toolbar-Element den Fokus
// vom Editor weg auf den Button zieht — sonst landen nachfolgende Tasten-
// eingaben im Nichts (Audit Bug 5: „GEFETTET" wird beim Tippen geschluckt,
// weil der Cursor aus ProseMirror verschwunden ist). Tiptaps `.focus()` im
// Command-Chain reicht nicht aus, weil das Mouseup-Event den Fokus
// nachträglich wieder auf den Button zieht.
const keepEditorFocus = (e: React.MouseEvent) => e.preventDefault();

// PROJ-34: Eigene Komponente, weil der Zustand von der Cursorposition abhängt.
function ImageSectionTool({
  editor,
  photoLimitReached,
  onInsert,
}: {
  editor: Editor;
  photoLimitReached: boolean;
  onInsert: () => void;
}) {
  const nextToSection = useEditorState({
    editor,
    selector: ({ editor: current }) => !canInsertImageSection(current.state),
  });
  const reason = photoLimitReached
    ? `Dieses Kapitel enthält bereits ${MAX_IMAGES_PER_CHAPTER} Fotos.`
    : nextToSection
      ? "Zwei Bildabschnitte brauchen mindestens eine Textzeile dazwischen. Bitte wählen Sie eine andere Stelle."
      : null;
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-8 w-8"
      onMouseDown={keepEditorFocus}
      onClick={onInsert}
      disabled={reason !== null}
      title={reason ?? "Bildabschnitt einfügen"}
      aria-label={reason ? `Bildabschnitt einfügen — ${reason}` : "Bildabschnitt einfügen"}
    >
      <ImagePlus className="h-4 w-4" />
    </Button>
  );
}

export function EditorToolbar({
  editor,
  readOnly = false,
  photoLimitReached = false,
  onInsertImageSection,
  bookFontSelect,
}: {
  editor: Editor | null;
  readOnly?: boolean;
  photoLimitReached?: boolean;
  onInsertImageSection?: () => void;
  /** PROJ-32: Auswahlfeld „Buchschrift", steht vorne in der Leiste. */
  bookFontSelect?: React.ReactNode;
}) {
  const lineHeightMenu = useRef({ openedWithPointer: false, closedWithEscape: false });

  if (!editor) return <ToolbarSkeleton />;

  const currentLineHeight = (editor.getAttributes("paragraph").lineHeight as string) ?? "1.5";
  const currentIndent = (editor.getAttributes("paragraph").indent as number | undefined) ?? 0;
  // Listen sind in Blockquotes nicht erlaubt (Stil-Konsistenz: Blockquote =
  // Zitat-Text, keine geschachtelten Aufzählungen). Toolbar-Buttons werden
  // deaktiviert, Tastenkombis blockiert (siehe extensions.ts).
  const inBlockquote = editor.isActive("blockquote");

  // Kein `.focus()` in der Kette: Es greift erst im nächsten Bild und könnte den
  // Fokus dann noch verschieben. Zurück in den Text führt `onCloseAutoFocus`.
  const setLineHeight = (v: string) => {
    editor
      .chain()
      .updateAttributes("paragraph", { lineHeight: v === "1.5" ? null : v })
      .run();
  };

  const changeIndent = (delta: number) => {
    const next = Math.max(0, Math.min(5, currentIndent + delta));
    editor.chain().focus().updateAttributes("paragraph", { indent: next || null }).run();
  };

  return (
    <div className="editor-chrome sticky top-0 z-[60] flex w-full justify-center border-b border-[#e0dcd5] bg-[#ece6df] py-1.5 shadow-sm">
    <div
      className={cn(
        "flex w-fit max-w-full flex-wrap items-center gap-1 px-2",
        readOnly && "[&_button:disabled:not([data-state=on])]:text-[#848484]",
      )}
    >
      <ReadOnlyScope readOnly={readOnly}>
      {bookFontSelect && (
        <>
          {bookFontSelect}
          <Sep />
        </>
      )}
      <Toggle
        size="sm"
        pressed={editor.isActive("bold")}
        onMouseDown={keepEditorFocus}
        onPressedChange={() => editor.chain().focus().toggleBold().run()}
        aria-label="Fett"
      >
        <Bold className="h-4 w-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive("italic")}
        onMouseDown={keepEditorFocus}
        onPressedChange={() => editor.chain().focus().toggleItalic().run()}
        aria-label="Kursiv"
      >
        <Italic className="h-4 w-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive("underline")}
        onMouseDown={keepEditorFocus}
        onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
        aria-label="Unterstrichen"
      >
        <UnderlineIcon className="h-4 w-4" />
      </Toggle>

      <Sep />

      <Toggle
        size="sm"
        pressed={editor.isActive("blockquote")}
        onMouseDown={keepEditorFocus}
        onPressedChange={() => editor.chain().focus().toggleBlockquote().run()}
        aria-label="Blockzitat"
      >
        <Quote className="h-4 w-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive("bulletList")}
        onMouseDown={keepEditorFocus}
        onPressedChange={() => {
          if (inBlockquote) return;
          editor.chain().focus().toggleBulletList().run();
        }}
        disabled={inBlockquote}
        aria-label={inBlockquote ? "Aufzählung — in Blockzitat nicht erlaubt" : "Aufzählung"}
        title={inBlockquote ? "In Blockzitaten sind Listen nicht erlaubt." : undefined}
      >
        <List className="h-4 w-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive("orderedList")}
        onMouseDown={keepEditorFocus}
        onPressedChange={() => {
          if (inBlockquote) return;
          editor.chain().focus().toggleOrderedList().run();
        }}
        disabled={inBlockquote}
        aria-label={inBlockquote ? "Nummerierte Liste — in Blockzitat nicht erlaubt" : "Nummerierte Liste"}
        title={inBlockquote ? "In Blockzitaten sind Listen nicht erlaubt." : undefined}
      >
        <ListOrdered className="h-4 w-4" />
      </Toggle>

      <Sep />

      <Toggle
        size="sm"
        pressed={editor.isActive({ textAlign: "left" })}
        onMouseDown={keepEditorFocus}
        onPressedChange={() => editor.chain().focus().setTextAlign("left").run()}
        aria-label="Linksbündig"
      >
        <AlignLeft className="h-4 w-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive({ textAlign: "center" })}
        onMouseDown={keepEditorFocus}
        onPressedChange={() => editor.chain().focus().setTextAlign("center").run()}
        aria-label="Zentriert"
      >
        <AlignCenter className="h-4 w-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive({ textAlign: "right" })}
        onMouseDown={keepEditorFocus}
        onPressedChange={() => editor.chain().focus().setTextAlign("right").run()}
        aria-label="Rechtsbündig"
      >
        <AlignRight className="h-4 w-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive({ textAlign: "justify" })}
        onMouseDown={keepEditorFocus}
        onPressedChange={() => editor.chain().focus().setTextAlign("justify").run()}
        aria-label="Blocksatz"
      >
        <AlignJustify className="h-4 w-4" />
      </Toggle>

      <Sep />

      <Select
        value={currentLineHeight}
        onValueChange={setLineHeight}
        onOpenChange={(open) => {
          if (open) lineHeightMenu.current.closedWithEscape = false;
        }}
        disabled={readOnly}
      >
        <SelectTrigger
          className="h-8 w-[88px] gap-1 border-transparent text-xs hover:bg-accent/40"
          onMouseDown={keepEditorFocus}
          onPointerDown={() => {
            lineHeightMenu.current.openedWithPointer = true;
          }}
          onKeyDown={() => {
            lineHeightMenu.current.openedWithPointer = false;
          }}
          aria-label="Zeilenabstand"
        >
          <SelectValue placeholder="Abstand" />
        </SelectTrigger>
        <SelectContent
          onEscapeKeyDown={() => {
            lineHeightMenu.current.closedWithEscape = true;
          }}
          onCloseAutoFocus={(event) => {
            // PROJ-25 BUG-1: Das Menü gibt den Fokus sonst an seinen Schalter
            // zurück, und die nächsten Tasten landen nirgends. Nur wer es mit
            // der Tastatur geöffnet und mit Escape abgebrochen hat, bleibt dort.
            const { openedWithPointer, closedWithEscape } = lineHeightMenu.current;
            lineHeightMenu.current.closedWithEscape = false;
            if (closedWithEscape && !openedWithPointer) return;
            event.preventDefault();
            editor.view.focus();
          }}
        >
          <SelectItem value="1">1,0</SelectItem>
          <SelectItem value="1.5">1,5</SelectItem>
          <SelectItem value="2">2,0</SelectItem>
        </SelectContent>
      </Select>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn("h-8 w-8", currentIndent === 0 && "text-[#a8a39b]")}
        onMouseDown={keepEditorFocus}
        onClick={() => changeIndent(-1)}
        aria-label="Einrückung verringern"
        disabled={currentIndent === 0}
      >
        <IndentDecrease className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        onMouseDown={keepEditorFocus}
        onClick={() => changeIndent(1)}
        aria-label="Einrückung erhöhen"
        disabled={currentIndent >= 5}
      >
        <IndentIncrease className="h-4 w-4" />
      </Button>

      <Sep />

      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 gap-1.5 px-2 text-xs"
        onMouseDown={keepEditorFocus}
        onClick={() => editor.chain().focus().insertPageBreak().run()}
        aria-label="Seitenumbruch einfügen"
      >
        <ScrollText className="h-4 w-4" />
        Seitenumbruch
      </Button>
      {onInsertImageSection && (
        <ImageSectionTool
          editor={editor}
          photoLimitReached={photoLimitReached}
          onInsert={onInsertImageSection}
        />
      )}

      <Sep />

      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        onMouseDown={keepEditorFocus}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        aria-label="Rückgängig"
      >
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        onMouseDown={keepEditorFocus}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        aria-label="Wiederherstellen"
      >
        <Redo2 className="h-4 w-4" />
      </Button>
      </ReadOnlyScope>
      </div>
    </div>
  );
}

function Sep() {
  return <Separator orientation="vertical" className="mx-0.5 h-6" />;
}

function ToolbarSkeleton() {
  return (
    <div className="editor-chrome sticky top-0 z-[60] flex w-full justify-center border-b border-[#e0dcd5] bg-[#ece6df] py-1.5 shadow-sm">
      <div className="flex h-8 items-center gap-2 px-3 text-sm text-[#848484]">
        <Minus className="h-4 w-4 animate-pulse" />
        Editor wird geladen …
      </div>
    </div>
  );
}
