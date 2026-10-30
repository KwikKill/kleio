import { selectWindow } from "@/lib/select";
import { getStore } from "@/lib/store";
import { nowYear } from "@/lib/time";
import type { EntriesResponse } from "@/lib/types";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

// GET /api/entries?from=1440&to=1660&lanes=sciences,arts&limit=60&bins=120
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const from = Number(q.get("from"));
  const to = Number(q.get("to"));
  if (!q.has("from") || !q.has("to") || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return Response.json({ error: "Indique une fenêtre valide : from et to en années, from < to." }, { status: 400 });
  }
  const limit = clamp(Number(q.get("limit") ?? 60) || 60, 1, 200);
  const bins = clamp(Number(q.get("bins") ?? 120) || 120, 1, 400);
  const lanes = (q.get("lanes") ?? "").split(",").filter(Boolean).slice(0, 24);

  const store = await getStore();
  const now = nowYear();
  const out: EntriesResponse = { from, to, lanes: {} };
  for (const id of lanes) {
    const list = store.byLane.get(id);
    if (list) out.lanes[id] = selectWindow(list, from, to, now, limit, bins);
  }
  return Response.json(out, { headers: { "Cache-Control": "public, max-age=300" } });
}
