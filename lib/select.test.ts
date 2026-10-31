import { describe, expect, it } from "vitest";
import { endOf, selectWindow } from "./select";
import type { WireEntry } from "./types";
import { readShare, shareQuery } from "./share";
import { clampView, EARLIEST, zoomAt } from "./view";

const NOW = 2026.83;
const e = (id: string, start: number, w: number, end?: number): WireEntry => ({ id, label: id, start, sp: 9, w, kind: "person", ...(end ? { end, ep: 9 } : {}) });

describe("selectWindow", () => {
  it("keeps entries overlapping the window, including spans that started before it", () => {
    const r = selectWindow([e("a", 1400, 5, 1500), e("b", 1300, 9, 1350), e("c", 1600, 1)], 1450, 1650, NOW, 10, 4);
    expect(r.items.map((x) => x.id).sort()).toEqual(["a", "c"]);
    expect(r.total).toBe(2);
  });

  it("spreads the picks across the window instead of taking the crowded part only", () => {
    const crowded = Array.from({ length: 50 }, (_, i) => e(`x${i}`, 1500 + i * 0.1, 100 + i));
    const quiet = e("quiet", 1900, 1);
    const r = selectWindow([...crowded, quiet], 1500, 2000, NOW, 24, 10);
    expect(r.items).toHaveLength(24);
    expect(r.items.some((x) => x.id === "quiet")).toBe(true);
  });

  it("counts every overlapping entry in the histogram", () => {
    const r = selectWindow([e("a", 1500, 1), e("b", 1510, 1), e("c", 1990, 1)], 1500, 2000, NOW, 1, 5);
    expect(r.hist).toEqual([2, 0, 0, 0, 1]);
  });

  it("stretches people born recently with no death date to the present", () => {
    expect(endOf(e("alive", 1961, 1), NOW)).toBe(NOW);
    expect(endOf(e("unknown", 1200, 1), NOW)).toBe(1200);
  });
});

describe("view", () => {
  it("zooms around the anchor", () => {
    const v = zoomAt({ from: 1000, to: 2000 }, 0.5, 0.5, NOW);
    expect(v).toEqual({ from: 1250, to: 1750 });
  });

  it("never goes before the Big Bang", () => {
    const v = clampView({ from: -2e10, to: -1.9e10 }, NOW);
    expect(v.from).toBe(EARLIEST);
  });

});

describe("share links", () => {
  it("round-trips the query string, selection included", () => {
    const q = shareQuery({ from: 1440, to: 1660 }, ["politique", "sciences"], "Q762");
    expect(q).toBe("v=1440,1660&l=politique,sciences&s=Q762");
    expect(readShare(`?${q}`, "")).toEqual({ view: { from: 1440, to: 1660 }, lanes: ["politique", "sciences"], selected: "Q762" });
  });

  it("still opens the first links, which used the hash", () => {
    expect(readShare("", "#v=-600000000,2027&l=geologie")).toEqual({ view: { from: -600000000, to: 2027 }, lanes: ["geologie"] });
  });

  it("keeps malformed lane ids and local-only selections out of the link", () => {
    expect(shareQuery(undefined, ["arts", "Bad Lane!"], "perso-abc")).toBe("l=arts");
  });
});
