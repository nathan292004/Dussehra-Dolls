// Creates an admin account, or resets the password of an existing one.
//   pnpm --filter @workspace/api-server run create-admin <username> "<Display Name>"
// The password is read from ADMIN_PASSWORD, or typed at a hidden prompt.
import { existsSync } from "fs";
import readline from "readline";

if (existsSync(".env")) process.loadEnvFile(".env");

const [rawUsername, displayName] = process.argv.slice(2);
if (!rawUsername) {
  console.error('Usage: create-admin <username> ["Display Name"]  (password via ADMIN_PASSWORD env or prompt)');
  process.exit(1);
}
const username = rawUsername.trim().toLowerCase();

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const original = (rl as any)._writeToOutput;
    (rl as any)._writeToOutput = (s: string) => {
      if (s.startsWith(question)) original.call(rl, s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const password = process.env.ADMIN_PASSWORD || (await promptHidden("Password (min 10 chars): "));
if (password.length < 10) {
  console.error("Password must be at least 10 characters.");
  process.exit(1);
}

const { db, pool } = await import("@workspace/db");
const { adminUsersTable } = await import("@workspace/db/schema");
const { hashAdminPassword } = await import("../lib/admin-auth");

const passwordHash = await hashAdminPassword(password);
await db
  .insert(adminUsersTable)
  .values({ username, name: displayName || username, passwordHash })
  .onConflictDoUpdate({
    target: adminUsersTable.username,
    set: { passwordHash, isActive: true, ...(displayName ? { name: displayName } : {}) },
  });
console.log(`Admin "${username}" saved.`);
await pool.end();
