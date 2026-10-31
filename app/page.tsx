import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import Kleio from "@/components/Kleio";
import { buildPreview } from "@/lib/preview";
import { parseShare } from "@/lib/share";

// Each shared link gets its own preview: title, description and a generated
// image (app/og/route.tsx) of the view, the lanes and the selected entry.
export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  const p = await buildPreview(parseShare(await searchParams));
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const suffix = p.query ? `?${p.query}` : "";
  const image = { url: `/og${suffix}`, width: 1200, height: 630, alt: p.alt };
  return {
    metadataBase: new URL(`${proto}://${host}`),
    // The layout's title template skips its own segment, and this page is in it.
    title: { absolute: p.kind === "home" ? "Kleio" : `${p.title} · Kleio` },
    description: p.description,
    openGraph: {
      type: "website",
      siteName: "Kleio",
      locale: "fr_FR",
      url: `/${suffix}`,
      title: p.kind === "home" ? "Kleio, du Big Bang à hier" : `${p.title} · Kleio`,
      description: p.description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: p.kind === "home" ? "Kleio, du Big Bang à hier" : `${p.title} · Kleio`,
      description: p.description,
      images: [image],
    },
  };
}

// The metadata reads the query string, so this page renders per request. The
// marker says so explicitly while the client shell stays prerendered.
async function Connection() {
  await connection();
  return null;
}

export default function Home() {
  return (
    <>
      <Kleio />
      <Suspense>
        <Connection />
      </Suspense>
    </>
  );
}
