import { describe, expect, it } from "vitest";
import hyphen from "hyphen/de-1996";
import {
  createWordHyphenator,
  findBreakPoints,
  SOFT_HYPHEN,
  stripSoftHyphens,
  stripSoftHyphensFromBody,
} from "./index";

const hyphenateWord = createWordHyphenator(hyphen.hyphenateSync);

/** Zeigt die erlaubten Trennstellen eines Absatzes als „-". */
function show(text: string): string {
  const points = findBreakPoints(text, hyphenateWord);
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    if (points.includes(i)) out += "-";
    out += text[i];
  }
  return out;
}

/** Ein Wort mitten im Absatz, damit die Regel fürs letzte Wort nicht greift. */
const inSentence = (word: string) => show(`${word} und`).replace(/ und$/, "");

describe("Wörterbuch: neue Rechtschreibung (AC-6)", () => {
  it.each([
    ["Zucker", "Zu-cker"],
    ["Fenster", "Fens-ter"],
    ["Kartoffel", "Kar-tof-fel"],
    ["Eisenbahnverbindung", "Ei-sen-bahn-ver-bin-dung"],
    ["Versicherungskaufmann", "Ver-si-che-rungs-kauf-mann"],
  ])("%s → %s", (word, expected) => {
    expect(hyphenateWord(word).split(SOFT_HYPHEN).join("-")).toBe(expected);
  });
});

describe("Buchregeln (Prüfstand mit Wortliste)", () => {
  it.each([
    // Mindestens 3 Buchstaben vor und nach der Trennstelle (AC-7)
    ["Zucker", "Zucker"],
    ["Fenster", "Fens-ter"],
    ["Kartoffel", "Kar-tof-fel"],
    ["Eisenbahnverbindung", "Eisen-bahn-ver-bin-dung"],
    ["Lebensmittelmarken", "Lebens-mit-tel-mar-ken"],
    ["Klavierunterricht", "Kla-vier-un-ter-richt"],
    ["Wohnung", "Woh-nung"],
    ["nebenbei", "neben-bei"],
    // Wörter unter 6 Buchstaben bleiben ganz
    ["Mutter", "Mut-ter"],
    ["Abend", "Abend"],
    // Großbuchstaben, Ziffern, Mail- und Webadressen bleiben ganz (AC-11)
    ["NARRAVIT", "NARRAVIT"],
    ["Ostern2024", "Ostern2024"],
    ["oma.helga@beispiel.de", "oma.helga@beispiel.de"],
    ["https://www.narravit.de/lebensbuch", "https://www.narravit.de/lebensbuch"],
    ["www.familienchronik.de", "www.familienchronik.de"],
    // Bindestrich-Wörter nur am Bindestrich (AC-12)
    ["Mutter-Kind-Kur", "Mutter-Kind-Kur"],
    ["Nachkriegs-Erinnerungen", "Nachkriegs-Erinnerungen"],
    // Englische Wörter bleiben ganz (AC-13)
    ["Meeting", "Meeting"],
    ["Feeling", "Feeling"],
    ["Weekend", "Weekend"],
    // Apostroph
    ["gibt's", "gibt's"],
  ])("%s → %s", (word, expected) => {
    expect(inSentence(word)).toBe(expected);
  });

  it("trennt Wörter mit Satzzeichen und Anführungszeichen am Buchstabenkern", () => {
    expect(show("„Großmutter“, sagte sie.")).toBe("„Groß-mutter“, sagte sie.");
  });

  it("lässt das letzte Wort eines Absatzes ganz (AC-10)", () => {
    expect(show("Wir besuchten die Großmutter")).toBe("Wir besuch-ten die Großmutter");
    expect(show("Wir besuchten die Großmutter.")).toBe("Wir besuch-ten die Großmutter.");
    expect(show("Großmutter")).toBe("Großmutter");
  });

  it("behandelt einen Zeilenumbruch im Absatz als Wortgrenze", () => {
    expect(show("Kartoffel\nKartoffel")).toBe("Kar-tof-fel\nKartoffel");
  });

  it("liefert für leeren Text keine Stellen", () => {
    expect(findBreakPoints("", hyphenateWord)).toEqual([]);
    expect(findBreakPoints("   ", hyphenateWord)).toEqual([]);
  });

  it("ignoriert alte Trennzeichen nicht, sie gehören vorher entfernt", () => {
    // Der Baustein bekommt immer sauberen Text, siehe stripSoftHyphensFromBody.
    expect(stripSoftHyphens(`Groß${SOFT_HYPHEN}mut${SOFT_HYPHEN}ter`)).toBe("Großmutter");
  });
});

describe("stripSoftHyphensFromBody", () => {
  const doc = (text: string) => ({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text }] },
      { type: "imageSection", attrs: { sectionId: "a" } },
      { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Zitat", marks: [{ type: "italic" }] }] }] },
    ],
  });

  it("gibt ohne Trennzeichen dasselbe Objekt zurück", () => {
    const body = doc("Großmutter");
    expect(stripSoftHyphensFromBody(body)).toBe(body);
  });

  it("entfernt Trennzeichen in allen Textknoten und lässt den Rest unverändert", () => {
    const body = doc(`Groß${SOFT_HYPHEN}mut${SOFT_HYPHEN}ter`);
    const stripped = stripSoftHyphensFromBody(body);
    expect(stripped).not.toBe(body);
    expect(stripped).toEqual(doc("Großmutter"));
    expect(stripped.content[1]).toBe(body.content[1]);
    expect(stripped.content[2]).toBe(body.content[2]);
  });

  it("verträgt fehlende oder unerwartete Werte", () => {
    expect(stripSoftHyphensFromBody(null)).toBeNull();
    expect(stripSoftHyphensFromBody("text")).toBe("text");
    expect(stripSoftHyphensFromBody({ type: "doc" })).toEqual({ type: "doc" });
  });
});
