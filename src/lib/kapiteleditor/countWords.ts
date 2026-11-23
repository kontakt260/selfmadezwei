type TipTapNode = {
  type?: string;
  text?: string;
  content?: TipTapNode[];
};

export function countWordsFromBody(body: unknown): number {
  if (!body || typeof body !== "object") return 0;
  // Soft-Hyphens (U+00AD) entfernen, bevor wir zählen: sie sind rein
  // typografische Bruchstellen-Marker (Audit Bug 10/16 — Hypher-Integration
  // 2026-05-21) und dürfen die Wortanzahl nicht beeinflussen.
  const text = extractText(body as TipTapNode).replace(/­/g, "");
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Ohne Rekursion: Der Server zählt auch Inhalte, die von außen kommen. Sehr tief
// verschachteltes JSON darf das Speichern nicht zum Absturz bringen.
function extractText(root: TipTapNode): string {
  const parts: string[] = [];
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const node = stack.pop() as TipTapNode | null | undefined;
    if (!node || typeof node !== "object") continue;
    if (typeof node.text === "string") {
      parts.push(node.text);
    } else if (Array.isArray(node.content)) {
      for (let i = node.content.length - 1; i >= 0; i--) stack.push(node.content[i]);
    }
  }
  return parts.join(" ");
}
