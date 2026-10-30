import { connection } from "next/server";
import { getStore, harvestProgress } from "@/lib/store";
import type { MetaResponse } from "@/lib/types";

export async function GET() {
  await connection();
  const store = await getStore();
  const body: MetaResponse = {
    harvestedAt: store.harvestedAt,
    source: store.source,
    lanes: store.lanes,
    harvest: harvestProgress(),
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
