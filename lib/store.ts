import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { DEEP_TIME_ENTRIES } from "./deep-time";
import { harvest, writeIndex } from "./harvest";
import type { Entry, HarvestProgress, IndexFile, LaneStatus, MetaResponse, WireEntry } from "./types";

// The index lives in memory: a few tens of thousands of entries, filtered per
// request in a few milliseconds. A fresh harvest (written to the data volume)
// wins over the snapshot committed with the code.
const DATA_DIR = process.env.KLEIO_DATA_DIR || path.join(process.cwd(), "data");
export const HARVEST_FILE = path.join(DATA_DIR, "index.json.gz");
export const SNAPSHOT_FILE = path.join(process.cwd(), "data", "snapshot.json.gz");

interface Store {
  source: MetaResponse["source"];
  harvestedAt: string | null;
  lanes: Record<string, LaneStatus>;
  byLane: Map<string, WireEntry[]>;
}

async function readIndex(file: string): Promise<IndexFile | null> {
  try {
    return JSON.parse(gunzipSync(await readFile(file)).toString("utf8")) as IndexFile;
  } catch {
    return null;
  }
}

async function load(): Promise<Store> {
  let file = await readIndex(HARVEST_FILE);
  let source: Store["source"] = "harvest";
  if (!file) {
    file = await readIndex(SNAPSHOT_FILE);
    source = file ? "snapshot" : "empty";
  }
  const byLane = new Map<string, WireEntry[]>();
  const add = (e: Entry) => {
    const { lanes, ...wire } = e;
    for (const l of lanes) {
      const list = byLane.get(l) ?? [];
      list.push(wire);
      byLane.set(l, list);
    }
  };
  DEEP_TIME_ENTRIES.forEach(add);
  file?.entries.forEach(add);
  return { source, harvestedAt: file?.harvestedAt ?? null, lanes: file?.lanes ?? {}, byLane };
}

let current: Promise<Store> | null = null;
export function getStore(): Promise<Store> {
  current ??= load();
  return current;
}

let progress: HarvestProgress | null = null;
export const harvestProgress = () => progress;

// Runs in the background of the request that started it; a second call while
// one is running is refused rather than queued.
export async function runHarvest(): Promise<void> {
  progress = { running: true, startedAt: new Date().toISOString(), step: "Démarrage", done: 0, total: 0 };
  try {
    const file = await harvest((p) => {
      progress = { ...progress!, ...p };
    });
    await writeIndex(file, HARVEST_FILE);
    current = load();
    await current;
    progress = { ...progress, running: false, finishedAt: new Date().toISOString() };
  } catch (e) {
    progress = { ...progress!, running: false, finishedAt: new Date().toISOString(), error: (e as Error).message };
  }
}

export function harvestRunning(): boolean {
  return progress?.running ?? false;
}
