/**
 * File: apps/web/src/lib/fonts.ts
 * Purpose: The handwriting font used to turn a typed name into a signature on the signature pad (SPEC D31), loaded
 * with next/font so it is self-hosted with the app.
 *
 * Functions:
 * - none
 */
import { Dancing_Script } from "next/font/google";

export const signatureFont = Dancing_Script({ subsets: ["latin"], weight: "600", display: "swap" });
