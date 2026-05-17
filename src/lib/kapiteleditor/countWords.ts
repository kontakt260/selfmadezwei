type TipTapNode = {
  type?: string;
  text?: string;
  content?: TipTapNode[];
};

export function countWordsFromBody(body: unknown): number {
  if (!body || typeof body !== "object") return 0;
  const text = extractText(body as TipTapNode);
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
