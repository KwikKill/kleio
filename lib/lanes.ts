// Preset lanes. Every QID below was checked against wbgetentities (French
// label in the trailing comment) before being used.

export type LaneSource =
  | { type: "occupation"; qids: [string, string][] } // wdt:P106, people
  | { type: "class"; qids: [string, string][] } // wdt:P31, events
  | { type: "static" }; // curated, see deep-time.ts

export interface LanePreset {
  id: string;
  label: string;
  group: "Personnes" | "Événements" | "Temps profond";
  color: string; // light theme
  colorDark: string;
  minSitelinks: number;
  source: LaneSource;
}

export const PRESETS: LanePreset[] = [
  {
    id: "sciences", label: "Sciences", group: "Personnes", color: "#1f6f8b", colorDark: "#5fb3d1", minSitelinks: 25,
    source: { type: "occupation", qids: [["Q901", "scientifique"], ["Q169470", "physicien"], ["Q170790", "mathématicien"], ["Q11063", "astronome"], ["Q593644", "chimiste"], ["Q864503", "biologiste"], ["Q2374149", "botaniste"], ["Q520549", "géologue"], ["Q39631", "médecin"]] },
  },
  {
    id: "pensee", label: "Philosophie", group: "Personnes", color: "#8a5a44", colorDark: "#d39c80", minSitelinks: 30,
    source: { type: "occupation", qids: [["Q4964182", "philosophe"], ["Q1234713", "théologien"]] },
  },
  {
    id: "arts", label: "Arts", group: "Personnes", color: "#c98a1a", colorDark: "#e8b04e", minSitelinks: 25,
    source: { type: "occupation", qids: [["Q1028181", "artiste peintre"], ["Q1281618", "sculpteur"], ["Q42973", "architecte"]] },
  },
  {
    id: "lettres", label: "Lettres", group: "Personnes", color: "#a8436b", colorDark: "#e07fa5", minSitelinks: 35,
    source: { type: "occupation", qids: [["Q36180", "écrivain"], ["Q49757", "poète"], ["Q214917", "dramaturge"], ["Q6625963", "romancier"]] },
  },
  {
    id: "musique", label: "Musique", group: "Personnes", color: "#3f6fb5", colorDark: "#8fb1ea", minSitelinks: 40,
    source: { type: "occupation", qids: [["Q36834", "compositeur"], ["Q639669", "musicien"], ["Q177220", "chanteur"]] },
  },
  {
    id: "cinema", label: "Cinéma", group: "Personnes", color: "#5d5d8f", colorDark: "#a3a3d6", minSitelinks: 30,
    source: { type: "occupation", qids: [["Q2526255", "réalisateur de cinéma"]] },
  },
  {
    id: "politique", label: "Politique", group: "Personnes", color: "#b23a48", colorDark: "#e5707d", minSitelinks: 40,
    source: { type: "occupation", qids: [["Q82955", "personnalité politique"], ["Q116", "monarque"]] },
  },
  {
    id: "militaires", label: "Militaires", group: "Personnes", color: "#6b6b3a", colorDark: "#b5b56d", minSitelinks: 35,
    source: { type: "occupation", qids: [["Q47064", "militaire"], ["Q189290", "officier"]] },
  },
  {
    id: "techniques", label: "Techniques", group: "Personnes", color: "#4a7a3a", colorDark: "#86c06f", minSitelinks: 20,
    source: { type: "occupation", qids: [["Q205375", "inventeur"], ["Q81096", "ingénieur"]] },
  },
  {
    id: "explorations", label: "Explorations", group: "Personnes", color: "#6a4c93", colorDark: "#a98bd6", minSitelinks: 20,
    source: { type: "occupation", qids: [["Q11900058", "explorateur"], ["Q11631", "astronaute"]] },
  },
  {
    id: "conflits", label: "Guerres et batailles", group: "Événements", color: "#7a2e2e", colorDark: "#d77b7b", minSitelinks: 15,
    source: { type: "class", qids: [["Q178561", "bataille"], ["Q198", "guerre"]] },
  },
  {
    id: "ruptures", label: "Traités et révolutions", group: "Événements", color: "#2f5d62", colorDark: "#79b8be", minSitelinks: 10,
    source: { type: "class", qids: [["Q131569", "traité"], ["Q10931", "révolution"]] },
  },
  {
    id: "catastrophes", label: "Catastrophes", group: "Événements", color: "#9a5b13", colorDark: "#e09a4f", minSitelinks: 10,
    source: { type: "class", qids: [["Q7944", "séisme"], ["Q7692360", "éruption volcanique"], ["Q3241045", "poussée épidémique"]] },
  },
  {
    id: "expeditions", label: "Expéditions", group: "Événements", color: "#3b6e8f", colorDark: "#83b6d6", minSitelinks: 5,
    source: { type: "class", qids: [["Q2401485", "expédition"]] },
  },
  { id: "geologie", label: "Échelle géologique", group: "Temps profond", color: "#6d7f4f", colorDark: "#a9bd88", minSitelinks: 0, source: { type: "static" } },
  { id: "cosmos", label: "Jalons du vivant", group: "Temps profond", color: "#2e6f6a", colorDark: "#6fc2b9", minSitelinks: 0, source: { type: "static" } },
];

export const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

export const DEFAULT_LANES = ["politique", "sciences", "arts", "techniques", "explorations"];

// Stage 1 of the harvest: only ids and sitelink counts. One query per QID,
// because the big occupations (painters, writers) already take 20-40 s alone
// and WDQS cuts queries at 60 s.
export function stageOneQuery(source: LaneSource, qid: string, minSitelinks: number): string {
  const prop = source.type === "occupation" ? "P106" : "P31";
  return `SELECT ?item ?sitelinks WHERE {
  ?item wdt:${prop} wd:${qid} ;
        wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${minSitelinks})
}`;
}

// Stage 2: dates (best rank, with precision) and labels for a batch of ids.
export function stageTwoQuery(kind: "person" | "event", ids: string[]): string {
  const values = ids.map((id) => `wd:${id}`).join(" ");
  const dated = (v: string, prop: string) =>
    `OPTIONAL { ?item p:${prop} ?${v}S . ?${v}S a wikibase:BestRank ; psv:${prop} [ wikibase:timeValue ?${v} ; wikibase:timePrecision ?${v}P ; wikibase:timeCalendarModel ?${v}C ] }`;
  const dates =
    kind === "person"
      ? [dated("start", "P569"), dated("end", "P570")]
      : [dated("point", "P585"), dated("start", "P580"), dated("end", "P582")];
  // Names written the same in every language now live only under "mul".
  // People must be real humans: occupations also tag fictional characters.
  return `SELECT * WHERE {
  VALUES ?item { ${values} }
  OPTIONAL { ?item rdfs:label ?labelFr . FILTER(LANG(?labelFr) = "fr") }
  OPTIONAL { ?item rdfs:label ?labelMul . FILTER(LANG(?labelMul) = "mul") }
  OPTIONAL { ?item rdfs:label ?labelEn . FILTER(LANG(?labelEn) = "en") }${kind === "person" ? "\n  OPTIONAL { ?item wdt:P31 wd:Q5 . BIND(1 AS ?human) }" : ""}
  ${dates.join("\n  ")}
}`;
}

// What the lane panel shows for a preset, and the starting point when the
// reader copies it into a live custom lane.
export function liveQueryFor(preset: LanePreset): string {
  if (preset.source.type === "static") return "";
  const values = preset.source.qids.map(([q, l]) => `wd:${q} # ${l}`).join("\n    ");
  if (preset.source.type === "occupation") {
    return `SELECT ?item ?itemLabel ?start ?end ?sitelinks WHERE {
  VALUES ?occ {
    ${values}
  }
  ?item wdt:P106 ?occ ; wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${Math.max(60, preset.minSitelinks)})
  ?item wdt:P569 ?start .
  OPTIONAL { ?item wdt:P570 ?end }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,mul,en". }
}
LIMIT 3000`;
  }
  return `SELECT ?item ?itemLabel ?start ?end ?sitelinks WHERE {
  VALUES ?class {
    ${values}
  }
  ?item wdt:P31 ?class ; wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${preset.minSitelinks})
  { ?item wdt:P585 ?start } UNION { ?item wdt:P580 ?start . OPTIONAL { ?item wdt:P582 ?end } }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,mul,en". }
}
LIMIT 3000`;
}
