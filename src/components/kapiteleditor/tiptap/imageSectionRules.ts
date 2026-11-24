import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model";
import { Selection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

// PROJ-34: Regeln für Bildabschnitte im Text. Reine Funktionen auf dem
// Dokument, damit sie ohne Browser testbar sind.

export const IMAGE_SECTION = "imageSection";
const PAGE_BREAK = "pageBreak";

export function sectionIdsIn(doc: PMNode): string[] {
  const ids: string[] = [];
  doc.forEach((node) => {
    if (node.type.name === IMAGE_SECTION) ids.push(node.attrs.sectionId as string);
  });
  return ids;
}

/** Nächster Block in einer Richtung. Seitenumbrüche zählen nicht als Zeile. */
function neighbourBlock(doc: PMNode, index: number, step: 1 | -1): PMNode | null {
  for (let i = index; i >= 0 && i < doc.childCount; i += step) {
    const node = doc.child(i);
    if (node.type.name !== PAGE_BREAK) return node;
  }
  return null;
}

type InsertPlan = {
  /** Position im Dokument, an der der Abschnitt eingefügt wird. */
  at: number;
  /** Die leere Zeile an dieser Stelle wird ersetzt. */
  replacesEmptyLine: boolean;
  /** Absatz wird hier geteilt. Leerzeichen um die Stelle fallen weg. */
  split: { from: number; to: number } | null;
};

const SPACE = /\s/;

/** Teilt nie mitten im Wort: Die Stelle rückt ans Ende des Wortes. */
function planParagraphSplit($pos: ResolvedPos): InsertPlan {
  const block = $pos.parent;
  const start = $pos.start();
  const text = block.textBetween(0, block.content.size, "\n", "\n");
  let offset = $pos.parentOffset;
  // Steht der Cursor schon zwischen zwei Wörtern, bleibt er dort.
  const insideWord =
    offset > 0 &&
    offset < text.length &&
    !SPACE.test(text[offset - 1]) &&
    !SPACE.test(text[offset]);
  if (insideWord) while (offset < text.length && !SPACE.test(text[offset])) offset += 1;

  let from = offset;
  while (from > 0 && SPACE.test(text[from - 1])) from -= 1;
  let to = offset;
  while (to < text.length && SPACE.test(text[to])) to += 1;

  if (from === 0) return { at: $pos.before(), replacesEmptyLine: false, split: null };
  if (to === text.length) return { at: $pos.after(), replacesEmptyLine: false, split: null };
  return {
    at: start + from + 1,
    replacesEmptyLine: false,
    split: { from: start + from, to: start + to },
  };
}

function planInsert(state: EditorState): InsertPlan {
  const $pos = state.selection.$to;
  if ($pos.depth === 0) return { at: $pos.pos, replacesEmptyLine: false, split: null };
  // In Listen und Zitaten steht der Abschnitt nach dem ganzen Block.
  if ($pos.depth > 1) return { at: $pos.after(1), replacesEmptyLine: false, split: null };
  if ($pos.parent.content.size === 0) {
    return { at: $pos.before(), replacesEmptyLine: true, split: null };
  }
  if ($pos.parentOffset === 0) return { at: $pos.before(), replacesEmptyLine: false, split: null };
  if ($pos.parentOffset === $pos.parent.content.size) {
    return { at: $pos.after(), replacesEmptyLine: false, split: null };
  }
  return planParagraphSplit($pos);
}

/** Würde ein neuer Abschnitt an dieser Stelle an einen anderen grenzen? */
export function canInsertImageSection(state: EditorState): boolean {
  const plan = planInsert(state);
  if (plan.split) return true;
  const $at = state.doc.resolve(plan.at);
  const before = neighbourBlock(state.doc, $at.index(0) - 1, -1);
  const after = neighbourBlock(state.doc, $at.index(0) + (plan.replacesEmptyLine ? 1 : 0), 1);
  return before?.type.name !== IMAGE_SECTION && after?.type.name !== IMAGE_SECTION;
}

/** Fügt den Abschnitt an der Cursorstelle ein, der Cursor steht danach dahinter. */
export function insertImageSectionTr(state: EditorState, sectionId: string): Transaction | null {
  if (!canInsertImageSection(state)) return null;
  const { schema } = state;
  const section = schema.nodes[IMAGE_SECTION].create({ sectionId });
  const plan = planInsert(state);
  const tr = state.tr;

  if (plan.split) {
    tr.delete(plan.split.from, plan.split.to);
    tr.split(plan.split.from);
    tr.insert(plan.at, section);
    tr.setSelection(TextSelection.near(tr.doc.resolve(plan.at + section.nodeSize), 1));
    return tr.scrollIntoView();
  }

  const end = plan.replacesEmptyLine ? plan.at + state.doc.nodeAt(plan.at)!.nodeSize : plan.at;
  const next = state.doc.resolve(end).nodeAfter;
  // Dahinter braucht es eine Zeile, in der man weiterschreiben kann.
  const needsLine = !next || next.type.name === PAGE_BREAK;
  const nodes = needsLine ? [section, schema.nodes.paragraph.create()] : [section];
  tr.replaceWith(plan.at, end, nodes);
  tr.setSelection(Selection.near(tr.doc.resolve(plan.at + section.nodeSize), 1));
  return tr.scrollIntoView();
}

/** Der Abschnitt direkt neben dem Cursor, wenn dieser am Rand seines Blocks steht. */
export function sectionNextToCursor(state: EditorState, direction: -1 | 1): number | null {
  const { selection, doc } = state;
  if (!selection.empty) return null;
  const $pos = selection.$from;
  let boundary = $pos.pos;
  if ($pos.depth > 0) {
    const atEdge = direction < 0 ? $pos.parentOffset === 0 : $pos.parentOffset === $pos.parent.content.size;
    if (!atEdge) return null;
    for (let depth = $pos.depth - 1; depth >= 1; depth -= 1) {
      const atEdgeOfParent =
        direction < 0
          ? $pos.index(depth) === 0
          : $pos.indexAfter(depth) === $pos.node(depth).childCount;
      if (!atEdgeOfParent) return null;
    }
    boundary = direction < 0 ? $pos.before(1) : $pos.after(1);
  }
  const $boundary = doc.resolve(boundary);
  const neighbour = direction < 0 ? $boundary.nodeBefore : $boundary.nodeAfter;
  if (neighbour?.type.name !== IMAGE_SECTION) return null;
  return direction < 0 ? boundary - neighbour.nodeSize : boundary;
}

export function findSectionPos(doc: PMNode, sectionId: string): number | null {
  let found: number | null = null;
  doc.forEach((node, offset) => {
    if (node.type.name === IMAGE_SECTION && node.attrs.sectionId === sectionId) found = offset;
  });
  return found;
}

/**
 * Entfernt einen Abschnitt. Die leere Zeile, die beim Einfügen dahinter entstand,
 * verschwindet mit ihm, solange davor noch Text steht.
 */
export function removeImageSectionTr(state: EditorState, pos: number): Transaction {
  const { doc, tr } = state;
  const node = doc.nodeAt(pos)!;
  const end = pos + node.nodeSize;
  const before = doc.resolve(pos).nodeBefore;
  const after = doc.nodeAt(end);
  const dropLine = Boolean(before) && after?.type.name === "paragraph" && after.content.size === 0;
  tr.delete(pos, dropLine ? end + after!.nodeSize : end);
  const $target = tr.doc.resolve(Math.min(pos, tr.doc.content.size));
  tr.setSelection(Selection.near($target, dropLine ? -1 : 1));
  return tr.scrollIntoView();
}

/** Setzt eine leere Zeile zwischen Abschnitte, die direkt aufeinanderfolgen. */
export function separateSectionsTr(state: EditorState): Transaction | null {
  const positions: number[] = [];
  let afterSection = false;
  state.doc.forEach((node, offset) => {
    if (node.type.name === IMAGE_SECTION) {
      if (afterSection) positions.push(offset);
      afterSection = true;
    } else if (node.type.name !== PAGE_BREAK) {
      afterSection = false;
    }
  });
  if (positions.length === 0) return null;
  const tr = state.tr;
  for (const position of positions.reverse()) {
    tr.insert(position, state.schema.nodes.paragraph.create());
  }
  return tr;
}
