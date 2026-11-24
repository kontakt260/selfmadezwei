import { describe, expect, it } from "vitest";
import { MIN_ROW_SCALE, maxGroupScale, planRowGroups } from "./imageRowLayout";

// A5-Geometrie des Editors in px (96 dpi): Inhaltsbereich 170 mm hoch,
// Reihe 3:2 auf voller Inhaltsbreite (103 mm), 4 mm Abstand.
const PAGE = (170 / 25.4) * 96;
const ROW = ((103 / 25.4) * 96 * 2) / 3;
const GAP = (4 / 25.4) * 96;

const plan = (rows: number, availableOnCurrentPage: number) =>
  planRowGroups({
    rowHeights: Array.from({ length: rows }, () => ROW),
    availableOnCurrentPage,
    pageContentHeight: PAGE,
    rowGap: GAP,
  });

const groupHeight = (count: number, scale: number) => count * ROW * scale + (count - 1) * GAP;

describe("maxGroupScale", () => {
  it("skaliert nur die Bildhöhen, nicht die Abstände", () => {
    const available = 580;
    const scale = maxGroupScale([ROW, ROW, ROW], available, GAP);
    // Die Gruppe füllt den Platz exakt aus — inklusive der festen Abstände.
    expect(groupHeight(3, scale)).toBeCloseTo(available, 5);
  });

  it("überschreitet nie die natürliche Größe", () => {
    expect(maxGroupScale([ROW], 5000, GAP)).toBe(1);
  });

  it("rechnet mit unterschiedlich hohen Reihen (PROJ-34)", () => {
    const portrait = ROW * 1.5;
    const available = 500;
    const scale = maxGroupScale([ROW, portrait], available, GAP);
    expect((ROW + portrait) * scale + GAP).toBeCloseTo(available, 5);
  });
});

describe("planRowGroups", () => {
  it("lässt Reihen unskaliert, wenn sie natürlich passen", () => {
    expect(plan(2, PAGE)).toEqual([{ count: 2, scale: 1 }]);
  });

  it("verkleinert eine Gruppe gemeinsam, bis sie auf die Seite passt", () => {
    const [group, ...rest] = plan(3, PAGE);
    expect(rest).toEqual([]);
    expect(group.count).toBe(3);
    expect(group.scale).toBeGreaterThanOrEqual(MIN_ROW_SCALE);
    expect(group.scale).toBeLessThan(1);
    expect(groupHeight(3, group.scale)).toBeLessThanOrEqual(PAGE + 0.01);
  });

  it("füllt zuerst den Restplatz und setzt den Rest auf die nächste Seite", () => {
    // Platz für genau eine verkleinerte Reihe.
    const available = ROW * 0.8;
    const groups = plan(3, available);
    expect(groups[0].count).toBe(1);
    expect(groups[0].scale).toBeCloseTo(0.8, 5);
    expect(groups[1]).toEqual({ count: 2, scale: 1 });
  });

  it("lässt die Seite frei, wenn nicht einmal eine Reihe mit Mindest-Skala passt", () => {
    // Regression 2026-11-16: früher wurde die Reihe trotzdem mit der
    // Mindest-Skala auf die alte Seite gesetzt und ragte in den Rand.
    const available = ROW * (MIN_ROW_SCALE - 0.02);
    const groups = plan(2, available);
    expect(groups).toEqual([{ count: 2, scale: 1 }]);
  });

  it("plant Hochformate mit ihrer eigenen Höhe (PROJ-34)", () => {
    const portrait = ROW * 1.5;
    const groups = planRowGroups({
      rowHeights: [portrait, ROW, portrait],
      availableOnCurrentPage: portrait + GAP + ROW,
      pageContentHeight: PAGE,
      rowGap: GAP,
    });
    expect(groups[0]).toEqual({ count: 2, scale: 1 });
    expect(groups[1]).toEqual({ count: 1, scale: 1 });
  });

  it("überschreitet in keiner Gruppe den verfügbaren Platz", () => {
    for (let rows = 1; rows <= 8; rows++) {
      for (let available = 0; available <= PAGE; available += 7) {
        const groups = plan(rows, available);
        expect(groups.reduce((sum, g) => sum + g.count, 0)).toBe(rows);
        let room = available;
        // Bleibt die erste Seite leer, beginnt die erste Gruppe auf einer vollen Seite.
        if (groupHeight(groups[0].count, groups[0].scale) > available + 0.5) room = PAGE;
        for (const g of groups) {
          expect(g.scale).toBeGreaterThanOrEqual(MIN_ROW_SCALE);
          expect(g.scale).toBeLessThanOrEqual(1);
          expect(groupHeight(g.count, g.scale)).toBeLessThanOrEqual(room + 0.5);
          room = PAGE;
        }
      }
    }
  });
});
