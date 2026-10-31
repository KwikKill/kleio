import { DEFAULT_LANES, PRESET_BY_ID } from "./lanes";
import { endOf, openKind, selectWindow } from "./select";
import { type ShareState, shareQuery } from "./share";
import { getStore } from "./store";
import { formatDates, formatRange, formatSpan, nowYear } from "./time";
import type { Entry, WireEntry, Year } from "./types";
import { clampView, DEFAULT_VIEW, fitSpan, type View } from "./view";

// What a shared link previews: the same words for the <meta> tags and for the
// generated image, so the card and its caption never disagree.

export const SITE_DESCRIPTION = "Une frise chronologique interactive pour explorer l'histoire du Big Bang à aujourd'hui, alimentée par Wikidata.";

export interface PreviewLane {
  id: string;
  label: string;
  color: string;
  items: WireEntry[];
}

export interface Preview {
  kind: "home" | "view" | "entry";
  heading: string; // large title on the image
  title: string; // <title> and og:title
  subtitle: string;
  description: string;
  alt: string;
  view: View;
  now: Year;
  lanes: PreviewLane[];
  selected?: Entry;
  query: string; // normalised share query, reused for the image URL
  total: number;
}

const MAX_LANES = 5;
const KIND = { person: "Personne", event: "Événement", period: "Période" } as const;

// "A, B et C"
function listFr(items: string[]): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

export async function buildPreview(share: ShareState): Promise<Preview> {
  const store = await getStore();
  const now = nowYear();
  const selected = share.selected ? store.byId.get(share.selected) : undefined;
  const asked = (share.lanes ?? []).filter((id) => PRESET_BY_ID.has(id));
  const laneIds = (asked.length ? asked : selected?.lanes.filter((id) => PRESET_BY_ID.has(id)) ?? DEFAULT_LANES).slice(0, MAX_LANES);
  const lanesOrDefault = laneIds.length ? laneIds : DEFAULT_LANES;

  let view: View;
  if (share.view) view = clampView(share.view, now);
  else if (selected) {
    const end = endOf(selected, now);
    view = fitSpan(selected.start, end > selected.start ? end : undefined, now);
  } else view = DEFAULT_VIEW;

  const lanes: PreviewLane[] = lanesOrDefault.map((id) => {
    const p = PRESET_BY_ID.get(id)!;
    const items = selectWindow(store.byLane.get(id) ?? [], view.from, view.to, now, 14, 1).items;
    // The shared entry is drawn even when less notable ones would have filled the lane.
    if (selected && selected.lanes.includes(id) && !items.some((e) => e.id === selected.id)) items.unshift(selected);
    return { id, label: p.label, color: p.color, items };
  });

  const names = [...new Map(lanes.flatMap((l) => l.items).map((e) => [e.id, e])).values()]
    .sort((a, b) => b.w - a.w)
    .slice(0, 4)
    .map((e) => e.label);
  const laneNames = lanes.map((l) => l.label);
  const range = formatRange(view.from, view.to, now);
  const query = shareQuery(share.view ? view : undefined, share.lanes ? lanesOrDefault : undefined, selected?.id);
  const base = { view, now, lanes, query, total: store.total };

  if (selected) {
    const dates = formatDates(selected, openKind(selected, now), now);
    const where = selected.lanes.map((id) => PRESET_BY_ID.get(id)?.label).filter(Boolean) as string[];
    const others = names.filter((n) => n !== selected.label).slice(0, 3);
    return {
      ...base,
      kind: "entry",
      selected,
      heading: selected.label,
      title: selected.label,
      subtitle: dates,
      description: `${KIND[selected.kind]}, ${dates}.${where.length ? ` Couloir${where.length > 1 ? "s" : ""} ${listFr(where)}.` : ""} Sur la frise de ${range}${others.length ? `, avec ${listFr(others)}` : ""}.`,
      alt: `Frise Kleio centrée sur ${selected.label}, ${dates}`,
    };
  }
  if (share.view) {
    return {
      ...base,
      kind: "view",
      heading: range,
      title: range,
      subtitle: `${formatSpan(view.to - view.from)} · ${laneNames.join(", ")}`,
      description: `${formatSpan(view.to - view.from)} d'histoire sur Kleio : ${listFr(names)}…`,
      alt: `Frise Kleio de ${range} : ${names.join(", ")}`,
    };
  }
  return {
    ...base,
    kind: "home",
    heading: "Du Big Bang à hier",
    title: "Kleio",
    subtitle: `Frise chronologique interactive · ${store.total.toLocaleString("fr-FR")} entrées tirées de Wikidata`,
    description: SITE_DESCRIPTION,
    alt: `Frise Kleio de ${range} : ${names.join(", ")}`,
  };
}
