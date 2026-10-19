/**
 * File: apps/api/scripts/admin-invite.ts
 * Purpose: `pnpm admin:invite -- --name "Shelly Melcher" --email shelly@365yachts.org` creates an admin account and
 * prints its invite link (SPEC D7), for the first admin or when nobody can sign in to use the Admins tab.
 *
 * Functions:
 * - readFlag(argv, name): returns the value after --name in argv, or null.
 * - main(argv): validates the flags, creates the admin and prints the invite link.
 */
import { createDb } from "@bp/db";
import { createAdminRequestSchema } from "@bp/shared";
import { loadRootEnvFile } from "@bp/shared/node";
import { inviteAdmin } from "../src/routes/admin/admins";

function readFlag(argv: string[], name: string): string | null {
  const index = argv.indexOf(`--${name}`);
  return index !== -1 ? (argv[index + 1] ?? null) : null;
}

async function main(argv: string[]): Promise<void> {
  loadRootEnvFile();
  const input = createAdminRequestSchema.parse({ name: readFlag(argv, "name"), email: readFlag(argv, "email") });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");
  const webOrigin = (process.env.WEB_ORIGIN ?? "http://localhost:3000").replace(/\/+$/, "");
  const { db, close } = createDb(databaseUrl, { max: 1 });
  try {
    const { token } = await inviteAdmin({ db, now: () => new Date() }, { ...input, invitedByUserId: null });
    console.log(`Admin ${input.email} created. Send them this invite link (valid 7 days):`);
    console.log(`${webOrigin}/invite/${token}`);
  } finally {
    await close();
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
