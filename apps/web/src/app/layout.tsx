/**
 * File: apps/web/src/app/layout.tsx
 * Purpose: Root layout for every page: loads the Manrope font, the global styles and the page metadata.
 *
 * Functions:
 * - RootLayout({ children }): renders the html and body shell around every route.
 */
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "365 Yachts Broker Portal",
  description: "Onboarding and team management for 365 Yachts brokers.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={manrope.variable}>
      <body className="min-h-dvh bg-page font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
