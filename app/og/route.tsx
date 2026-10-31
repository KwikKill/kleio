import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { buildPreview } from "@/lib/preview";
import { LABEL_PX, packBars } from "@/lib/preview-layout";
import { parseShare } from "@/lib/share";
import { makeTicks } from "@/lib/time";

// GET /og?v=1440,1660&l=politique,sciences&s=Q762: the 1200x630 card shown
// when a Kleio link is shared. Same palette as the light theme.

// fr-FR number formatting uses U+202F, which the bundled fonts may not cover.
const txt = (s: string) => s.replace(/ /g, " ");

const C = { bg: "#f6f6f3", panel: "#ffffff", ink: "#1b1b1b", muted: "#66665e", line: "#dcdcd5", alt: "#f3f3ef", now: "#b23a48" };
const W = 1200;
const PAD = 56;
const PANEL_TOP = 252;
const PANEL_W = W - PAD * 2;
const PANEL_H = 318;
const AXIS_H = 34;
const LABEL_COL = 176;
const BARS_W = PANEL_W - LABEL_COL - 20;
const ROW_H = 27;
const BAR_H = 20;

type Font = { name: string; data: ArrayBuffer; weight: 500 | 600; style: "normal" };
let fonts: Promise<Font[]> | null = null;
function loadFonts(): Promise<Font[]> {
  const dir = path.join(process.cwd(), "assets", "fonts");
  const one = async (file: string, name: string, weight: 500 | 600): Promise<Font> => {
    const buf = await readFile(path.join(dir, file));
    return { name, weight, style: "normal", data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer };
  };
  fonts ??= Promise.all([
    one("Newsreader-SemiBold.ttf", "Newsreader", 600),
    one("IBMPlexSans-Medium.ttf", "Plex Sans", 500),
    one("IBMPlexSans-SemiBold.ttf", "Plex Sans", 600),
    one("IBMPlexMono-Medium.ttf", "Plex Mono", 500),
  ]);
  return fonts;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const p = await buildPreview(parseShare(url.searchParams));
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const { view, now } = p;
  const X = (t: number) => ((t - view.from) / (view.to - view.from)) * BARS_W;

  const laneH = (PANEL_H - AXIS_H) / Math.max(1, p.lanes.length);
  const rows = Math.max(1, Math.floor((laneH - 8) / ROW_H));
  const rowTop = (r: number) => (laneH - rows * ROW_H) / 2 + r * ROW_H + (ROW_H - BAR_H) / 2;

  let lastEnd = -Infinity;
  const ticks = makeTicks(view.from, view.to, BARS_W, now, 190).filter((t) => {
    const x = X(t.t);
    if (x < 0 || x > BARS_W - 40 || x < lastEnd + 24) return false;
    lastEnd = x + txt(t.label).length * 8.5;
    return true;
  });

  const headingSize = p.heading.length <= 14 ? 92 : p.heading.length <= 22 ? 76 : 58;
  const eyebrow = p.kind === "entry" ? "Frise chronologique · fiche" : p.kind === "view" ? "Frise chronologique · vue partagée" : "Frise chronologique · Wikidata";
  const nowX = X(now);
  const sel = p.selected;
  const selA = sel ? Math.max(0, X(sel.start)) : 0;
  const selB = sel ? Math.min(BARS_W, X(sel.end ?? sel.start)) : 0;

  const card = (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", position: "relative", background: C.bg, color: C.ink, fontFamily: "Plex Sans", padding: `44px ${PAD}px 0` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "Plex Mono", color: C.muted }}>
        <div style={{ display: "flex", fontSize: 21, letterSpacing: 7, color: C.ink }}>KLEIO</div>
        <div style={{ display: "flex", fontSize: 17, letterSpacing: 1.5, textTransform: "uppercase" }}>{eyebrow}</div>
      </div>
      <div style={{ display: "flex", fontFamily: "Newsreader", fontWeight: 600, fontSize: headingSize, lineHeight: 1, letterSpacing: -2, marginTop: 30 }}>{txt(p.heading)}</div>
      <div style={{ display: "flex", fontSize: 27, fontWeight: 500, color: C.muted, marginTop: 16 }}>{txt(p.subtitle)}</div>

      <div style={{ position: "absolute", left: PAD, top: PANEL_TOP, width: PANEL_W, height: PANEL_H, display: "flex", flexDirection: "column", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "flex", position: "relative", height: AXIS_H, borderBottom: `1px solid ${C.line}` }}>
          {ticks.map((t) => (
            <div key={t.t} style={{ position: "absolute", left: LABEL_COL + X(t.t), top: 0, height: AXIS_H, display: "flex", alignItems: "center", paddingLeft: 6, borderLeft: `1px solid ${C.line}`, fontFamily: "Plex Mono", fontSize: 14, color: t.major ? C.ink : C.muted }}>
              {txt(t.label)}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", position: "relative", flex: 1 }}>
          {p.lanes.map((lane, i) => (
            <div key={lane.id} style={{ position: "absolute", left: 0, top: i * laneH, width: PANEL_W, height: laneH, display: "flex", background: i % 2 ? C.alt : C.panel, borderTop: i ? `1px solid ${C.line}` : "none" }}>
              <div style={{ position: "absolute", left: 18, top: 0, height: laneH, width: LABEL_COL - 30, display: "flex", alignItems: "center", fontFamily: "Plex Mono", fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase", color: lane.color }}>
                {lane.label}
              </div>
              <div style={{ position: "absolute", left: LABEL_COL, top: 0, width: BARS_W, height: laneH, display: "flex" }}>
                {packBars(lane.items, view, now, BARS_W, rows, sel?.id).map((b) => (
                  <div key={b.id} style={{ position: "absolute", left: 0, top: rowTop(b.row), width: BARS_W, height: BAR_H, display: "flex" }}>
                    {b.w > 0 ? (
                      <div style={{ position: "absolute", left: b.x, top: 0, width: b.w, height: BAR_H, background: lane.color, borderRadius: 3, border: b.selected ? `3px solid ${C.ink}` : "none" }} />
                    ) : (
                      <div style={{ position: "absolute", left: b.x - 7, top: BAR_H / 2 - 7, width: 14, height: 14, background: lane.color, borderRadius: 7, border: b.selected ? `3px solid ${C.ink}` : "none" }} />
                    )}
                    <div style={{ position: "absolute", left: b.labelX, top: 0, height: BAR_H, display: "flex", alignItems: "center", fontSize: LABEL_PX, fontWeight: 600, color: b.inside ? "#ffffff" : C.ink, whiteSpace: "nowrap" }}>
                      {txt(b.label)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {sel && selB > selA && <div style={{ position: "absolute", left: LABEL_COL + selA, top: 0, width: Math.max(3, selB - selA), height: PANEL_H - AXIS_H, background: "rgba(27,27,27,0.06)", display: "flex" }} />}
          {nowX >= 0 && nowX <= BARS_W && <div style={{ position: "absolute", left: LABEL_COL + nowX, top: 0, width: 2, height: PANEL_H - AXIS_H, background: C.now, opacity: 0.7, display: "flex" }} />}
        </div>
      </div>

      <div style={{ position: "absolute", left: PAD, right: PAD, bottom: 22, display: "flex", justifyContent: "space-between", fontFamily: "Plex Mono", fontSize: 16, color: C.muted }}>
        <div style={{ display: "flex" }}>{txt(`${p.total.toLocaleString("fr-FR")} entrées · données Wikidata`)}</div>
        <div style={{ display: "flex" }}>{host}</div>
      </div>
    </div>
  );

  return new ImageResponse(card, {
    width: W,
    height: 630,
    fonts: await loadFonts(),
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
