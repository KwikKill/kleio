import type { Entry } from "./types";

// Curated lanes for the time before written records, where Wikidata dates are
// too sparse and too inconsistent to harvest. Boundaries come from the ICS
// International Chronostratigraphic Chart (v2024/12) as reproduced on the
// English Wikipedia "Geologic time scale" page; milestones are the commonly
// cited approximate values and are labelled as such.

const REF = 2000; // ages in Ma are counted back from here; irrelevant at that scale
const ma = (v: number) => REF - v * 1e6;

type Span = [id: string, label: string, startMa: number, endMa: number, row: number, weight: number];

const ICS: Span[] = [
  ["hadeen", "Hadéen", 4567, 4031, 0, 1000],
  ["archeen", "Archéen", 4031, 2500, 0, 1000],
  ["proterozoique", "Protérozoïque", 2500, 538.8, 0, 1000],
  ["phanerozoique", "Phanérozoïque", 538.8, 0, 0, 1000],
  ["paleozoique", "Paléozoïque", 538.8, 251.902, 1, 800],
  ["mesozoique", "Mésozoïque", 251.902, 66, 1, 800],
  ["cenozoique", "Cénozoïque", 66, 0, 1, 800],
  ["cambrien", "Cambrien", 538.8, 486.85, 2, 600],
  ["ordovicien", "Ordovicien", 486.85, 443.1, 2, 600],
  ["silurien", "Silurien", 443.1, 419.62, 2, 600],
  ["devonien", "Dévonien", 419.62, 358.86, 2, 600],
  ["carbonifere", "Carbonifère", 358.86, 298.9, 2, 600],
  ["permien", "Permien", 298.9, 251.902, 2, 600],
  ["trias", "Trias", 251.902, 201.4, 2, 600],
  ["jurassique", "Jurassique", 201.4, 143.1, 2, 600],
  ["cretace", "Crétacé", 143.1, 66, 2, 600],
  ["paleogene", "Paléogène", 66, 23.04, 2, 600],
  ["neogene", "Néogène", 23.04, 2.58, 2, 600],
  ["quaternaire", "Quaternaire", 2.58, 0, 2, 600],
];

type Point = [id: string, label: string, t: number, precision: number, weight: number];

const MILESTONES: Point[] = [
  ["big-bang", "Big Bang (≈ 13,8 Ga)", ma(13787), 1, 1000],
  ["systeme-solaire", "Formation du Système solaire (≈ 4,57 Ga)", ma(4567), 3, 900],
  ["terre", "Formation de la Terre (≈ 4,54 Ga)", ma(4540), 3, 900],
  ["vie", "Plus anciennes traces de vie probables (≈ 3,7 Ga)", ma(3700), 2, 800],
  ["oxygenation", "Grande Oxydation (≈ 2,4 Ga)", ma(2400), 2, 700],
  ["cambrien", "Explosion cambrienne", ma(538.8), 3, 700],
  ["extinction-pt", "Extinction Permien-Trias", ma(251.902), 3, 700],
  ["extinction-kpg", "Extinction Crétacé-Paléogène", ma(66), 3, 800],
  ["sapiens", "Premiers Homo sapiens connus (≈ 300 ka)", REF - 300_000, 4, 800],
  ["neolithique", "Débuts de l'agriculture (≈ 9500 av. J.-C.)", -9499, 6, 700],
  ["ecriture", "Premières écritures (≈ 3200 av. J.-C.)", -3199, 6, 800],
];

export const DEEP_TIME_ENTRIES: Entry[] = [
  ...ICS.map(([id, label, s, e, row, w]): Entry => ({
    id: `ics-${id}`,
    label,
    start: ma(s),
    sp: 3,
    end: e === 0 ? undefined : ma(e), // still running: drawn up to "now"
    ep: 3,
    w,
    kind: "period",
    lanes: ["geologie"],
    row,
  })),
  ...MILESTONES.map(([id, label, t, sp, w]): Entry => ({ id: `kleio-${id}`, label, start: t, sp, w, kind: "event", lanes: ["cosmos"] })),
];
