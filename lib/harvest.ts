import { gzipSync } from "node:zlib";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { PRESETS, stageOneQuery, stageTwoQuery } from "./lanes";
import { centerCoarse, JULIAN, nowYear, parseXsdTime } from "./time";
import type { Entry, IndexFile, LaneStatus } from "./types";
import { type Binding, qidOf, sparql } from "./wdqs";

// Why a harvest instead of live queries: WDQS has no index on dates or on
// sitelink counts, so "the most notable people born between 1440 and 1660"
// scans every human and hits the 60 s limit whatever the window. Starting
// from an occupation or a class is selective, so the index is built that way,
// once, and served locally.

export interface Progress {
  step: string;
  done: number;
  total: number;
}

const BATCH = 250;
const PAUSE_MS = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Member {
  w: number;
  lanes: Set<string>;
  kind: "person" | "event";
}

interface Dated {
  t: number;
  p: number;
  julian: boolean;
}

// Several best-rank values can coexist (disputed birth years): keep the most
// precise, then the earliest. WDQS has already converted Julian dates to the
// Gregorian axis; the flag only keeps the label as recorded.
function pickDate(rows: Binding[], v: string): Dated | undefined {
  let best: Dated | undefined;
  for (const r of rows) {
    if (!r[v]) continue;
    const t = parseXsdTime(r[v].value);
    if (t === null) continue;
    const p = Number(r[`${v}P`]?.value ?? 9);
    if (!best || p > best.p || (p === best.p && t < best.t)) best = { t, p, julian: r[`${v}C`]?.value === JULIAN && p >= 11 };
  }
  return best && { ...best, t: centerCoarse(best.t, best.p) };
}

const round = (t: number) => Math.round(t * 1e4) / 1e4;

export async function harvest(onProgress: (p: Progress) => void = () => {}): Promise<IndexFile> {
  const presets = PRESETS.filter((p) => p.source.type !== "static");
  const jobs = presets.flatMap((p) => (p.source.type === "static" ? [] : p.source.qids.map(([qid, label]) => ({ p, qid, label }))));
  const members = new Map<string, Member>();
  const status: Record<string, LaneStatus> = {};
  const errors: Record<string, string[]> = {};

  let done = 0;
  let total = jobs.length;
  for (const { p, qid, label } of jobs) {
    onProgress({ step: `${p.label} : ${label}`, done, total });
    try {
      const rows = await sparql(stageOneQuery(p.source, qid, p.minSitelinks));
      for (const r of rows) {
        const id = qidOf(r.item.value);
        const m = members.get(id) ?? { w: 0, lanes: new Set<string>(), kind: p.source.type === "occupation" ? "person" : "event" };
        m.w = Math.max(m.w, Number(r.sitelinks.value));
        m.lanes.add(p.id);
        if (p.source.type === "occupation") m.kind = "person";
        members.set(id, m);
      }
    } catch (e) {
      (errors[p.id] ??= []).push(`${label} : ${(e as Error).message}`);
    }
    done++;
    await sleep(PAUSE_MS);
  }

  const entries: Entry[] = [];
  const now = nowYear();
  for (const kind of ["person", "event"] as const) {
    const ids = [...members].filter(([, m]) => m.kind === kind).map(([id]) => id);
    const batches = Math.ceil(ids.length / BATCH);
    total += batches;
    for (let b = 0; b < batches; b++) {
      onProgress({ step: `Dates et libellés (${kind === "person" ? "personnes" : "événements"})`, done, total });
      const slice = ids.slice(b * BATCH, (b + 1) * BATCH);
      let rows: Binding[] = [];
      try {
        rows = await sparql(stageTwoQuery(kind, slice));
      } catch (e) {
        (errors._details ??= []).push((e as Error).message);
      }
      const byItem = new Map<string, Binding[]>();
      for (const r of rows) {
        const id = qidOf(r.item.value);
        byItem.set(id, [...(byItem.get(id) ?? []), r]);
      }
      for (const [id, rs] of byItem) {
        const m = members.get(id)!;
        // Occupations also tag fictional characters (James T. Kirk is an "explorer").
        if (kind === "person" && !rs.some((r) => r.human)) continue;
        const start = kind === "person" ? pickDate(rs, "start") : (pickDate(rs, "point") ?? pickDate(rs, "start"));
        if (!start || start.t > now) continue;
        const end = pickDate(rs, "end");
        const label = (["labelFr", "labelMul", "labelEn"] as const).map((k) => rs.find((r) => r[k])?.[k].value).find(Boolean) ?? id;
        entries.push({
          id,
          label,
          start: round(start.t),
          sp: start.p,
          ...(start.julian ? { sj: 1 as const } : {}),
          ...(end && end.t >= start.t && end.t <= now ? { end: round(end.t), ep: end.p, ...(end.julian ? { ej: 1 as const } : {}) } : {}),
          w: m.w,
          kind,
          lanes: [...m.lanes],
        });
      }
      done++;
      await sleep(PAUSE_MS);
    }
  }

  for (const p of presets) {
    status[p.id] = { count: entries.filter((e) => e.lanes.includes(p.id)).length };
    if (errors[p.id]) status[p.id].error = errors[p.id].join(" ; ");
  }
  if (errors._details) {
    for (const s of Object.values(status)) s.error = [s.error, `${errors._details.length} lot(s) de détails en échec`].filter(Boolean).join(" ; ");
  }
  onProgress({ step: "Terminé", done: total, total });
  return { version: 1, harvestedAt: new Date().toISOString(), lanes: status, entries };
}

export async function writeIndex(file: IndexFile, target: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await writeFile(tmp, gzipSync(JSON.stringify(file)));
  await rename(tmp, target);
}
