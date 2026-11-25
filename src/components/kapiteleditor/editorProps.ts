// PROJ-34: Fest statt bei jedem Rendern neu. TipTap vergleicht die Optionen und
// setzt sie bei jeder Abweichung neu, dabei entstanden die Bildabschnitte jedes
// Mal neu und verloren offene Dialoge.
//
// Word-/Docs-Verhalten: nach jeder Eingabe folgt der Viewport dem Cursor. Wir
// nutzen NICHT mehr `() => true` (das hatte ProseMirrors scrollIntoView komplett
// deaktiviert) — stattdessen lassen wir ProseMirror standardmäßig in den View
// scrollen UND glätten den Effekt nach der Pagination-Engine selbst per
// `keepCursorInView` (sonst kann ein nachträglich eingefügter Spacer den Cursor
// wieder aus dem Viewport schieben).
//
// PROJ-32: Der Neusatz im Hintergrund nutzt dieselben Optionen, damit er genau
// wie der Editor setzt.
export const EDITOR_PROPS = {
  attributes: {
    class: "tiptap-editor focus:outline-none",
  },
};
