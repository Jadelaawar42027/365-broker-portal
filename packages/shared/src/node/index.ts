/**
 * File: packages/shared/src/node/index.ts
 * Purpose: Node-only helpers shared by the API, the database scripts and the web server config.
 * Never import this from browser code.
 *
 * Functions:
 * - none
 */
export { findRootEnvFile, loadRootEnvFile } from "./env-file";
