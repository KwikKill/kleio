# Kleio

Live at `kleio.somi.{WEBSITE_HOST}` in production, `kleio.somi.localhost`
in the beta stack.

A timeline you can zoom from the Big Bang to yesterday. People, events and
geological periods sit in themed lanes; zoomed out you see 13.8 billion
years, zoomed in you read days. What is shown changes with the scale, like
a map: the most notable entries first, more of them as the window narrows.

## What it does

- **One continuous axis.** Wheel to zoom around the pointer, drag (or pinch)
  to pan, double-click to zoom on a point. Ticks follow the scale: days,
  months, round years (BCE years counted backwards, so "500 av. J.-C." stays
  round), then "66 Ma" / "4,54 Ga" before the present.
- **Lanes.** Science, arts, letters, music, politics, explorers, wars,
  treaties, disasters... plus two curated deep-time lanes (the ICS geological
  scale and a few milestones of life). Add, remove and reorder them; the
  setup is in the URL (`#v=1440,1660&l=politique,sciences`), so a view can be
  shared as a link.
- **Semantic zoom.** Each lane gets the most notable entries of the window
  (by Wikidata sitelink count), spread across it so a crowded century does not
  push a quiet one off the screen. A density strip under each lane shows
  everything that exists there, shown or not.
- **Minimap.** A logarithmic bar of time before now, from the Big Bang to a
  day ago, with the current view as a bracket you can drag or drop elsewhere.
- **Details.** Clicking an entry opens it in the bottom panel: dates at their
  real precision ("XVe siècle", "15 avril 1452", "il y a 66 Ma"), description,
  portrait from Commons, occupations, links, and how many contemporaries are
  on screen. The search box looks anything up on Wikidata and flies there.
- **Custom SPARQL lanes.** Write a query returning `?item` and `?start`
  (optionally `?end`, `?itemLabel`, `?sitelinks`) and it becomes a lane. It
  runs live from the browser against WDQS, results are cached in
  localStorage. Any preset lane can be copied as a starting point.

## Why the data is harvested, not queried live

The obvious design (ask WDQS for "the most notable people born between 1440
and 1660" whenever the view moves) does not work, and that was measured, not
assumed:

| Query | Result |
| --- | --- |
| all humans, birth date in a 220-year window, sitelinks > 80 | timeout (60 s) |
| same, with the join order forced to start from the date range | 39 s for a 20-year window |
| all humans with ≥ 60 sitelinks, no date filter | truncated at 60 s |
| physicists (`wdt:P106 wd:Q169470`) with ≥ 25 sitelinks | 8 s, 1,158 rows |
| battles, wars, treaties, revolutions with ≥ 10-15 sitelinks | 2 s |

Blazegraph has no index usable for a date range or a sitelink threshold, so
every such query scans every human, whatever the window. Starting from an
occupation or a class is selective. So Kleio builds a local index that way
and serves it itself:

1. **Stage 1**, one query per occupation / class: ids and sitelink counts
   only (`lib/lanes.ts`, `stageOneQuery`). One per QID because the big ones
   (painters, writers) already take 20-40 s on their own.
2. **Stage 2**, batches of 250 ids: best-rank dates *with their precision*
   (`p:P569/psv:P569`, `wikibase:BestRank`) and French/English labels. About
   a second per batch.
3. The result is a gzipped JSON file loaded in memory by the server.
   `GET /api/entries` filters it per lane and window in a few milliseconds.

The harvest pauses a second between queries and retries with backoff on
429/5xx. A truncated 200 response (WDQS streams results and stops at 60 s)
counts as a failure, not as data. The committed snapshot (2026-10-31) holds
22,953 entries in 600 KB of gzipped JSON and took about ten minutes.

Stage 2 also cleans what Wikidata returns as is:

- **Labels.** Names written the same in every language now exist only as a
  `mul` label (Marie Curie has no `fr` or `en` label), so labels fall back
  fr → mul → en, and live queries use `wikibase:language "fr,mul,en"`.
- **Fiction.** Occupations also tag fictional characters (James T. Kirk is an
  "explorer" born in 2233), so people must be `wdt:P31 wd:Q5`, and nothing
  may start or end after the harvest date.
- **Coarse dates.** "11th century" is stored as 1001 or as 1100 depending on
  who entered it; dates coarser than a year move to the middle of their
  decade, century or millennium, and are drawn with a blurred edge when the
  uncertainty is visible at the current zoom.
- **Calendars.** WDQS converts Julian dates to Gregorian (Leonardo is born on
  24 April 1452 there). The axis stays Gregorian, but such dates keep a flag
  (`sj` / `ej`) and are labelled as recorded: "15 avril 1452".

The index file is `{ version, harvestedAt, lanes: { id: { count, error? } },
entries: [...] }`, one entry being
`{ id, label, start, sp, sj?, end?, ep?, ej?, w, kind, lanes }` (dates as
astronomical years with a fraction, `sp`/`ep` Wikibase precision codes, `w`
the sitelink count).

Custom lanes are the exception: they run live because the reader wrote the
query and is the one waiting for it.

### Dates

WDQS returns XSD 1.1 dates, where year 0 exists and is 1 BCE, so `-0099` is
100 BCE: the year is already astronomical and is used as is. The Wikibase
JSON API (used by search and the detail panel) keeps the historical
numbering (`-0100` for 100 BCE), so the two have separate parsers
(`parseXsdTime` / `parseWikibaseTime` in `lib/time.ts`). Internally a date is
one float, an astronomical year with the position inside the year as the
fraction; float64 keeps sub-minute resolution even 13.8 billion years back.

### Deep time

Wikidata dates before writing are too sparse to harvest, so the two deep-time
lanes are curated in `lib/deep-time.ts`. Geological boundaries follow the ICS
International Chronostratigraphic Chart (v2024/12) as reproduced on the
English Wikipedia "Geologic time scale" page. Recheck them against the chart
itself (stratigraphy.org) when it is next revised. Milestones (Big Bang,
first traces of life, Homo sapiens...) are commonly cited approximate values
and are labelled with "≈".

## Architecture

```
app/api/entries   GET  window of each lane: selected entries + density histogram
app/api/meta      GET  harvest date, per-lane counts and errors, harvest progress
app/api/harvest   POST start a harvest (Bearer KLEIO_HARVEST_SECRET), answers 202
lib/harvest.ts    the two-stage harvest
lib/store.ts      in-memory index: data volume first, committed snapshot second
lib/select.ts     semantic zoom (bucketed top-N) shared by server and custom lanes
lib/time.ts       time model, French formatting, adaptive ticks
lib/render-timeline.ts  canvas drawing and row packing, no React
components/       Kleio (state), Timeline (canvas + gestures), Overview, TopBar,
                  BottomPanel, LanePicker
cron/             kleio-cron sidecar: weekly POST /api/harvest
data/snapshot.json.gz   index committed with the code, so a fresh deploy works
```

The client asks for the view plus a quarter on each side, so small pans
redraw from what is already loaded; requests are debounced and aborted when
the view moves on. The canvas is redrawn on every view change (a few hundred
shapes), labels are measured once and cached.

## Running it

```
cp .env.example .env        # set KLEIO_HARVEST_SECRET, and a contact in KLEIO_USER_AGENT
npm install
npm run dev
npm test                    # time model, semantic zoom, view maths
npm run harvest             # rebuild data/snapshot.json.gz (about ten minutes)
```

In the infra, from the repo root:

```
./compose.sh up -d --build kleio kleio-cron     # prod
./compose.sh beta up -d --build kleio           # beta, no cron
```

Prod keeps fresh harvests in the `kleio-data` volume (`KLEIO_DATA_DIR=/data`);
they win over the snapshot baked into the image. `kleio-cron` triggers one
every Monday at 04:00 (Europe/Paris). To run one by hand:

```
curl -X POST -H "Authorization: Bearer $KLEIO_HARVEST_SECRET" http://kleio:3000/api/harvest
curl http://kleio:3000/api/meta     # progress
```
