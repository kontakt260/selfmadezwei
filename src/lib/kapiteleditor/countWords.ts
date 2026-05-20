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

export function countPageBreaksFromBody(body: unknown): number {
  if (!body || typeof body !== "object") return 0;
  return countByType(body as TipTapNode, "pageBreak");
}

function countByType(node: TipTapNode, type: string): number {
  if (!node) return 0;
  let count = node.type === type ? 1 : 0;
  if (Array.isArray(node.content)) {
    for (const c of node.content) count += countByType(c, type);
  }
  return count;
}

function extractText(node: TipTapNode): string {
  if (!node) return "";
  if (typeof node.text === "string") return node.text + " ";
  if (Array.isArray(node.content)) {
    return node.content.map(extractText).join("");
  }
  return "";
}
