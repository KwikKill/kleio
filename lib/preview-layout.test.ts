import { describe, expect, it } from "vitest";
import { DEEP_TIME_ENTRIES } from "./deep-time";
import { packBars } from "./preview-layout";

const NOW = 2026.83;

describe("packBars", () => {
  it("keeps consecutive geological units on their own rows", () => {
    const geology = DEEP_TIME_ENTRIES.filter((e) => e.lanes.includes("geologie"));
    const bars = packBars(geology, { from: NOW - 7e8, to: NOW }, NOW, 920, 3);
    const rowOf = (id: string) => bars.find((b) => b.id === id)?.row;
    expect(rowOf("ics-proterozoique")).toBe(0);
    expect(rowOf("ics-phanerozoique")).toBe(0);
    expect(rowOf("ics-paleozoique")).toBe(1);
    expect(rowOf("ics-mesozoique")).toBe(1);
    expect(rowOf("ics-cambrien")).toBe(2);
  });

  it("drops what does not fit instead of overlapping", () => {
    const crowd = Array.from({ length: 20 }, (_, i) => ({ id: `Q${i}`, label: `Personne ${i}`, start: 1500 + i, sp: 9, w: 100 - i, kind: "event" as const }));
    const bars = packBars(crowd, { from: 1400, to: 1700 }, NOW, 900, 2);
    for (const row of [0, 1]) {
      const xs = bars.filter((b) => b.row === row).map((b) => b.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThan(20);
    }
    expect(bars.length).toBeLessThan(20);
  });
});
