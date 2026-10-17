/**
 * File: packages/shared/src/index.ts
 * Purpose: Public entry of @bp/shared, the code both the web app and the API import (constants, schemas,
 * onboarding rules, metrics maths, permissions, chapters, WhatsApp links, training rules). Safe to use in the browser.
 *
 * Functions:
 * - none
 */
export const PRODUCT_NAME = "365 Yachts Broker Portal";

export * from "./api";
export * from "./api-training";
export * from "./chapters";
export * from "./constants";
export * from "./files";
export * from "./metrics";
export * from "./next-step";
export * from "./permissions";
export * from "./schemas";
export * from "./status-labels";
export * from "./step-machine";
export * from "./training";
export * from "./whatsapp";
