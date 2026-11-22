import { describe, expect, it } from "vitest";
import { submittedText } from "./form-values";

function form(entries: Record<string, string | Blob>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("submittedText", () => {
  it("returns the submitted text unchanged", () => {
    expect(submittedText(form({ email: " Maria@Example.test " }), "email")).toBe(
      " Maria@Example.test ",
    );
  });

  it("returns an empty string for a missing field", () => {
    expect(submittedText(form({}), "email")).toBe("");
  });

  it("ignores uploaded files", () => {
    expect(submittedText(form({ email: new Blob(["x"]) }), "email")).toBe("");
  });

  it("cuts very long input", () => {
    expect(submittedText(form({ email: "a".repeat(1000) }), "email")).toHaveLength(320);
    expect(submittedText(form({ name: "a".repeat(1000) }), "name", 200)).toHaveLength(200);
  });
});
