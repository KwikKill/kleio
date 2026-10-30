import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import "./globals.css";

const display = Newsreader({ variable: "--kl-display", subsets: ["latin", "latin-ext"], weight: ["400", "600"] });
const sans = IBM_Plex_Sans({ variable: "--kl-sans", subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ variable: "--kl-mono", subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Kleio",
  description: "Une frise chronologique interactive pour explorer l'histoire du Big Bang à aujourd'hui, alimentée par Wikidata.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#121311" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
