import { describe, expect, it } from "vitest";
import { countWordsFromBody } from "./countWords";

const paragraph = (...texts: string[]) => ({
  type: "paragraph",
  content: texts.map((text) => ({ type: "text", text })),
});

describe("countWordsFromBody", () => {
  it("zählt Wörter über mehrere Absätze", () => {
    expect(
      countWordsFromBody({ type: "doc", content: [paragraph("eins zwei"), paragraph("drei")] }),
    ).toBe(3);
  });

  it("zählt Soft-Hyphens nicht als Trennung", () => {
    expect(countWordsFromBody({ type: "doc", content: [paragraph("Don­au­schiff")] })).toBe(1);
  });

  it("gibt bei leerem Inhalt 0 zurück", () => {
    expect(countWordsFromBody(null)).toBe(0);
    expect(countWordsFromBody({ type: "doc", content: [{ type: "paragraph" }] })).toBe(0);
  });

  it("übersteht sehr tief verschachteltes JSON", () => {
    let node: Record<string, unknown> = { type: "text", text: "tief" };
    for (let depth = 0; depth < 200_000; depth += 1) node = { type: "x", content: [node] };
    expect(countWordsFromBody(node)).toBe(1);
  });
});
