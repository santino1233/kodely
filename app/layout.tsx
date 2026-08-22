import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kodely — AI Website Builder",
  description:
    "Kodely is an AI website builder. Describe the site you want in plain English, and Kodely designs it, writes a real React app, and publishes it live at a working URL — no coding or hosting setup required.",
};

// Sets the .dark class before paint (no flash), preferring a saved manual
// choice over the OS setting — must run inline, before hydration.
const NO_FLASH_THEME_SCRIPT = `
(function(){
  try {
    var saved = localStorage.getItem("kodely-theme");
    var dark = saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("light", !dark);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* next/script, not a bare <script> tag: React 19 warns ("Scripts
            inside React components are never executed when rendering on the
            client") because a plain script element rendered by a component is
            not specially tracked the way next/script's `beforeInteractive`
            strategy is — Next hoists and injects THIS one directly into the
            initial HTML outside React's own render/hydration path, which is
            what actually guarantees it runs before paint. A bare script tag
            worked by coincidence on first load; it was never the documented
            way to do this. */}
        <Script
          id="no-flash-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
