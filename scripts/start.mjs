/**
 * File: scripts/start.mjs
 * Purpose: The production start command for both Railway services (`node scripts/start.mjs`, also the root `pnpm start`
 * that Railpack looks for). It starts the built api or the web app depending on which Railway service runs it
 * (RAILWAY_SERVICE_NAME, or BP_SERVICE to override). It launches Node directly, without pnpm in between, so Railway's
 * SIGTERM on redeploy reaches the server and it shuts down cleanly.
 *
 * Functions:
 * - pickService(env): returns "api" or "web" from BP_SERVICE or RAILWAY_SERVICE_NAME, or null if neither names one.
 * - commandFor(service, env): returns the node arguments and working folder that start that service.
 * - main(): starts the service, forwards SIGTERM/SIGINT to it and exits with its exit code.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

export function pickService(env) {
  const name = (env.BP_SERVICE || env.RAILWAY_SERVICE_NAME || "").trim().toLowerCase();
  if (name === "api" || name.endsWith("-api") || name.startsWith("api-")) return "api";
  if (name === "web" || name.endsWith("-web") || name.startsWith("web-")) return "web";
  return null;
}

export function commandFor(service, env) {
  if (service === "api") return { args: ["dist/server.js"], cwd: path.join(ROOT, "apps", "api") };
  return {
    args: ["node_modules/next/dist/bin/next", "start", "--port", env.PORT || "3000"],
    cwd: path.join(ROOT, "apps", "web"),
  };
}

function main() {
  const service = pickService(process.env);
  if (!service) {
    console.error(
      `Can't tell which app to start (RAILWAY_SERVICE_NAME="${process.env.RAILWAY_SERVICE_NAME ?? ""}"). ` +
        "Name the Railway services api and web, set BP_SERVICE=api or BP_SERVICE=web, or set a Custom Start Command (docs/DEPLOY.md).",
    );
    process.exit(1);
  }
  const { args, cwd } = commandFor(service, process.env);
  console.log(`Starting ${service}: node ${args.join(" ")}`);
  const child = spawn(process.execPath, args, { cwd, stdio: "inherit" });
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
