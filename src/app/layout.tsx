import type { Metadata, Viewport } from "next";
import { Bungee, Inter, Monoton, Press_Start_2P, VT323, Yellowtail } from "next/font/google";
import "./globals.css";

// Fonts per CLAUDE.md §8 — exposed as CSS vars, mapped onto tokens in globals.css.
const neon = Monoton({ weight: "400", subsets: ["latin"], variable: "--ff-neon" });
const script = Yellowtail({ weight: "400", subsets: ["latin"], variable: "--ff-script" });
const banner = Bungee({ weight: "400", subsets: ["latin"], variable: "--ff-banner" });
const hud = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--ff-hud" });
const term = VT323({ weight: "400", subsets: ["latin"], variable: "--ff-term" });
const body = Inter({ subsets: ["latin"], variable: "--ff-body" });

export const metadata: Metadata = {
  title: "StrandVault",
  description: "A 1986 neon video store that's secretly a streaming guide.",
};

export const viewport: Viewport = { themeColor: "#0B0620" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${neon.variable} ${script.variable} ${banner.variable} ${hud.variable} ${term.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
