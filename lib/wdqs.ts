// Server-side access to the Wikidata Query Service, used only by the harvest.

export const WDQS_ENDPOINT = "https://query.wikidata.org/sparql";

// Wikimedia asks automated clients for a descriptive User-Agent with a way to
// reach the operator. Set KLEIO_USER_AGENT to include your own contact.
const USER_AGENT = process.env.KLEIO_USER_AGENT || "Kleio/0.1 (self-hosted timeline; harvests once a week)";

export type Binding = Record<string, { type: string; value: string; datatype?: string }>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class WdqsError extends Error {}

export async function sparql(query: string, retries = 3): Promise<Binding[]> {
  let lastError = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(5000 * 2 ** (attempt - 1));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 75_000);
    try {
      const res = await fetch(WDQS_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/sparql-results+json",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: new URLSearchParams({ query }),
        signal: ctrl.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        const wait = Number(res.headers.get("retry-after"));
        if (wait > 0) await sleep(Math.min(wait, 120) * 1000);
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const text = await res.text();
      if (!res.ok) throw new WdqsError(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      try {
        return JSON.parse(text).results.bindings as Binding[];
      } catch {
        // WDQS streams results and stops at its 60 s limit, so a timed-out
        // query arrives as a 200 with truncated JSON.
        lastError = "réponse tronquée (limite de 60 s de WDQS)";
      }
    } catch (e) {
      if (e instanceof WdqsError) throw e;
      lastError = ctrl.signal.aborted ? "délai dépassé" : String(e);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new WdqsError(lastError);
}

export const qidOf = (uri: string) => uri.slice(uri.lastIndexOf("/") + 1);
