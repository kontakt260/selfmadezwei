"use client";

import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
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
import { cn } from "@/lib/utils";

export function EditorToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return <ToolbarSkeleton />;

  const currentLineHeight = (editor.getAttributes("paragraph").lineHeight as string) ?? "1.5";
  const currentIndent = (editor.getAttributes("paragraph").indent as number | undefined) ?? 0;
  // Listen sind in Blockquotes nicht erlaubt (Stil-Konsistenz: Blockquote =
  // Zitat-Text, keine geschachtelten Aufzählungen). Toolbar-Buttons werden
  // deaktiviert, Tastenkombis blockiert (siehe extensions.ts).
  const inBlockquote = editor.isActive("blockquote");

  const setLineHeight = (v: string) => {
    editor
      .chain()
      .focus()
      .updateAttributes("paragraph", { lineHeight: v === "1.5" ? null : v })
      .run();
  };

  const changeIndent = (delta: number) => {
    const next = Math.max(0, Math.min(5, currentIndent + delta));
    editor.chain().focus().updateAttributes("paragraph", { indent: next || null }).run();
  };

  return (
    <div className="editor-chrome sticky top-0 z-[60] flex w-full justify-center border-b border-[#e0dcd5] bg-[#ece6df] py-1.5 shadow-sm">
    <div className="flex w-fit max-w-full flex-wrap items-center gap-1 px-2">
      <Toggle
        size="sm"
        pressed={editor.isActive("bold")}
        onPressedChange={() => editor.chain().focus().toggleBold().run()}
        aria-label="Fett"
      >
        <Bold className="h-4 w-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive("italic")}
        onPressedChange={() => editor.chain().focus().toggleItalic().run()}
        aria-label="Kursiv"
      >
        <Italic className="h-4 w-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive("underline")}
        onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
        aria-label="Unterstrichen"
      >
        <UnderlineIcon className="h-4 w-4" />
      </Toggle>

      <Sep />

      <Toggle
        size="sm"
        pressed={editor.isActive("blockquote")}
        onPressedChange={() => editor.chain().focus().toggleBlockquote().run()}
        aria-label="Blockzitat"
      >
        <Quote className="h-4 w-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive("bulletList")}
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
        onPressedChange={() => editor.chain().focus().setTextAlign("left").run()}
        aria-label="Linksbündig"
      >
        <AlignLeft className="h-4 w-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive({ textAlign: "center" })}
        onPressedChange={() => editor.chain().focus().setTextAlign("center").run()}
        aria-label="Zentriert"
      >
        <AlignCenter className="h-4 w-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive({ textAlign: "right" })}
        onPressedChange={() => editor.chain().focus().setTextAlign("right").run()}
        aria-label="Rechtsbündig"
      >
        <AlignRight className="h-4 w-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive({ textAlign: "justify" })}
        onPressedChange={() => editor.chain().focus().setTextAlign("justify").run()}
        aria-label="Blocksatz"
      >
        <AlignJustify className="h-4 w-4" />
      </Toggle>

      <Sep />

      <Select value={currentLineHeight} onValueChange={setLineHeight}>
        <SelectTrigger
          className="h-8 w-[88px] gap-1 border-transparent text-xs hover:bg-accent/40"
          aria-label="Zeilenabstand"
        >
          <SelectValue placeholder="Abstand" />
        </SelectTrigger>
        <SelectContent>
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
        onMouseDown={(e) => {
          // preventDefault verhindert, dass der Klick den Editor-Fokus +
          // die Selektion verliert — sonst würde insertPageBreak an einer
          // falschen Position oder gar nicht einfügen.
          e.preventDefault();
        }}
        onClick={() => editor.chain().focus().insertPageBreak().run()}
        aria-label="Seitenumbruch einfügen"
      >
        <ScrollText className="h-4 w-4" />
        Seitenumbruch
      </Button>

      <Sep />

      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8"
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
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        aria-label="Wiederherstellen"
      >
        <Redo2 className="h-4 w-4" />
      </Button>
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
