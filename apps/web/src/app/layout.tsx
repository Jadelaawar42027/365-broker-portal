/**
 * File: apps/web/src/app/layout.tsx
 * Purpose: Root layout for every page: loads the Manrope font, the global styles, the page metadata and viewport
 * colours, and a "Skip to main content" link for keyboard users.
 *
 * Functions:
 * - RootLayout({ children }): renders the html and body shell around every route.
 */
import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "365 Yachts Broker Portal",
  description: "Onboarding and team management for 365 Yachts brokers.",
};

export const viewport: Viewport = {
  themeColor: "#0A1F3D",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={manrope.variable}>
      <body className="min-h-dvh bg-page font-sans text-ink antialiased">
        <a
          href="#main"
          className="sr-only z-50 rounded-xl bg-navy px-5 py-3 text-lg font-bold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
