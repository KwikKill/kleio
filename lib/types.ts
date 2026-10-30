// Time is a single float: an astronomical year (year 0 = 1 BCE, -99 = 100 BCE),
// with the fractional part as the position inside that year. Float64 keeps
// sub-minute resolution even at -13.8e9, so one number covers every zoom level.
export type Year = number;

// Wikibase time precision codes: 0 = billion years ... 9 = year, 10 = month, 11 = day.
export type Precision = number;

export interface Entry {
  id: string; // Wikidata QID, or "ics-..." / "kleio-..." for curated entries
  label: string;
  start: Year;
  sp: Precision;
  end?: Year;
  ep?: Precision;
  sj?: 1; // start recorded in the Julian calendar (display only, the axis is Gregorian)
  ej?: 1;
  w: number; // notability weight: Wikidata sitelink count, or a curated equivalent
  kind: "person" | "event" | "period";
  lanes: string[];
  row?: number; // fixed row for curated nested spans (eon / era / period)
}

// What the API sends for one lane: entries without their lane membership.
export type WireEntry = Omit<Entry, "lanes">;

export interface LaneWindow {
  items: WireEntry[];
  hist: number[]; // entry starts per bin across the requested window
  total: number; // entries overlapping the window, shown or not
}

export interface EntriesResponse {
  from: Year;
  to: Year;
  lanes: Record<string, LaneWindow>;
}

export interface LaneStatus {
  count: number;
  error?: string;
}

export interface IndexFile {
  version: 1;
  harvestedAt: string;
  lanes: Record<string, LaneStatus>;
  entries: Entry[];
}

export interface MetaResponse {
  harvestedAt: string | null;
  source: "harvest" | "snapshot" | "empty";
  lanes: Record<string, LaneStatus>;
  harvest: HarvestProgress | null;
}

export interface HarvestProgress {
  running: boolean;
  startedAt: string;
  step: string;
  done: number;
  total: number;
  finishedAt?: string;
  error?: string;
}
