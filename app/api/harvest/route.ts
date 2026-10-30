import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { harvestRunning, runHarvest } from "@/lib/store";

// POST /api/harvest, called weekly by the kleio-cron container (cron/harvest.sh).
// Answers right away; progress is visible on GET /api/meta.
export async function POST(request: Request) {
  const secret = process.env.KLEIO_HARVEST_SECRET;
  if (!secret) {
    return Response.json({ error: "KLEIO_HARVEST_SECRET n'est pas défini côté serveur." }, { status: 503 });
  }
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "Jeton manquant ou invalide." }, { status: 401 });
  }
  if (harvestRunning()) {
    return Response.json({ error: "Une collecte est déjà en cours." }, { status: 409 });
  }
  // runHarvest marks itself as running before its first await, so a second
  // request arriving during this one sees the flag.
  const job = runHarvest();
  after(() => job);
  return Response.json({ started: true }, { status: 202 });
}
