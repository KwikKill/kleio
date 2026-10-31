import { describe, expect, it } from "vitest";
import { centerCoarse, formatAgo, formatDates, formatPoint, formatRange, fromCalendar, guessPrecision, julianToGregorian, makeTicks, parseWikibaseTime, parseXsdTime, toCalendar } from "./time";

const NOW = 2026.83;

describe("parsing", () => {
  it("reads WDQS years as astronomical (year 0 = 1 BCE)", () => {
    // Julius Caesar: WDQS gives -0099, the Wikibase API gives -0100 for 100 BCE.
    expect(Math.floor(parseXsdTime("-0099-07-01T00:00:00Z")!)).toBe(-99);
    expect(Math.floor(parseWikibaseTime("-0100-07-12T00:00:00Z")!)).toBe(-99);
  });

  it("places days inside the year", () => {
    const t = parseXsdTime("1452-04-15T00:00:00Z")!;
    expect(toCalendar(t)).toEqual({ y: 1452, m: 4, d: 15 });
  });

  it("accepts the 00 month and day of coarse Wikibase dates", () => {
    expect(parseWikibaseTime("+1500-00-00T00:00:00Z")).toBe(1500);
  });

  it("handles deep time without a calendar", () => {
    expect(parseXsdTime("-13787000000-01-01T00:00:00Z")).toBe(-13787000000);
  });

  it("shows Julian dates as recorded while keeping the Gregorian axis", () => {
    // Leonardo: WDQS gives 24 April 1452 (Gregorian) for a Julian 15 April 1452.
    const t = parseXsdTime("1452-04-24T00:00:00Z")!;
    expect(formatPoint(t, 11, NOW, true)).toBe("15 avril 1452");
    expect(toCalendar(julianToGregorian(fromCalendar(1452, 4, 15)))).toEqual({ y: 1452, m: 4, d: 24 });
    expect(toCalendar(julianToGregorian(fromCalendar(1582, 10, 4)))).toEqual({ y: 1582, m: 10, d: 14 });
  });

  it("keeps a rounded midnight on its own day", () => {
    // Leonardo's death as stored in the first snapshots: 1519.3589 is 12 May 1519
    // minus about 20 minutes once rounded to 1e-4 year.
    expect(toCalendar(1519.3589)).toEqual({ y: 1519, m: 5, d: 12 });
    expect(formatPoint(1519.3589, 11, NOW, true)).toBe("2 mai 1519");
  });

  it("moves coarse dates to the middle of their interval", () => {
    expect(centerCoarse(1100, 7)).toBe(1050);
    expect(centerCoarse(1001, 7)).toBe(1050);
    expect(formatPoint(centerCoarse(-299, 7), 7, NOW)).toBe("IIIe siècle av. J.-C.");
    expect(centerCoarse(1452.3, 11)).toBe(1452.3);
  });

  it("guesses precision for live queries", () => {
    expect(guessPrecision("1914-01-01T00:00:00Z")).toBe(9);
    expect(guessPrecision("1914-07-01T00:00:00Z")).toBe(10);
    expect(guessPrecision("1914-07-28T00:00:00Z")).toBe(11);
  });

  it("round-trips calendar dates", () => {
    expect(toCalendar(fromCalendar(-43, 3, 13))).toEqual({ y: -43, m: 3, d: 13 });
  });
});

describe("formatting", () => {
  it("formats each precision in French", () => {
    expect(formatPoint(fromCalendar(1452, 4, 15), 11, NOW)).toBe("15 avril 1452");
    expect(formatPoint(fromCalendar(1789, 7, 1), 10, NOW)).toBe("juillet 1789");
    expect(formatPoint(-99, 9, NOW)).toBe("100 av. J.-C.");
    expect(formatPoint(1401, 7, NOW)).toBe("XVe siècle");
    expect(formatPoint(1500, 7, NOW)).toBe("XVe siècle");
    expect(formatPoint(1, 7, NOW)).toBe("Ier siècle");
    expect(formatPoint(-2999, 6, NOW)).toBe("IIIe millénaire av. J.-C.");
  });

  it("switches to time before present in deep time", () => {
    expect(formatAgo(13.787e9)).toBe("13,8 Ga");
    expect(formatAgo(66e6)).toBe("66 Ma");
    expect(formatPoint(2000 - 66e6, 3, NOW)).toBe("il y a 66 Ma");
  });

  it("formats lifespans and open spans", () => {
    expect(formatDates({ start: 1452, sp: 9, end: 1519, ep: 9 }, null, NOW)).toBe("1452 · 1519");
    expect(formatDates({ start: 1961, sp: 9 }, "alive", NOW)).toBe("1961 · en vie");
  });

  it("formats the visible range", () => {
    expect(formatRange(1440, 1660, NOW)).toBe("1440 à 1660");
    expect(formatRange(2000 - 300e6, 2000 - 200e6, NOW)).toBe("300 Ma à 200 Ma");
  });
});

describe("ticks", () => {
  it("counts BCE years backwards so labels stay round", () => {
    // 1500 years over 1500 px: one tick every ~110 px rounds up to a 200-year step.
    const ticks = makeTicks(-1100, 400, 1500, NOW);
    expect(ticks.some((t) => t.label === "400 av. J.-C." && t.t === -399)).toBe(true);
    expect(ticks.some((t) => t.label === "200" && t.t === 200)).toBe(true);
  });

  it("uses time before present in deep time", () => {
    const ticks = makeTicks(NOW - 5e8, NOW - 1e8, 1000, NOW);
    expect(ticks.length).toBeGreaterThan(3);
    expect(ticks.every((t) => t.label.endsWith("Ma"))).toBe(true);
    expect(ticks.every((t, i) => i === 0 || t.t > ticks[i - 1].t)).toBe(true);
  });

  it("uses months and days when zoomed in", () => {
    const months = makeTicks(fromCalendar(1969, 1, 1), fromCalendar(1970, 1, 1), 1200, NOW);
    expect(months.map((t) => t.label)).toContain("juil.");
    const days = makeTicks(fromCalendar(1969, 7, 10), fromCalendar(1969, 7, 30), 1200, NOW);
    // 20 days over 1200 px gives a 2-day step on odd days.
    expect(days.map((t) => t.label)).toContain("21 juil.");
  });
});
