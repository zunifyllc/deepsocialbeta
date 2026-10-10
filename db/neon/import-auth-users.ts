/**
 * One-time import of old-backend auth users into Better Auth (Neon).
 * Keeps the same ids (= profiles.id) and emails. bcrypt password hashes are
 * imported as-is (verified by the app's bcrypt fallback). Google identities
 * are linked by provider subject. Users with neither are flagged
 * needsPasswordReset. Idempotent.
 * Usage: bun db/neon/import-auth-users.ts <export.json>
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

type Exported = {
  id: string; email: string; hash: string | null; email_confirmed_at: string | null;
  created_at: string; updated_at: string; name: string | null; image: string | null;
  identities: { provider: string; sub: string }[] | null;
};

const sql = neon(process.env["DATABASE_URL"]!);
const users = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as Exported[];
let imported = 0;
for (const u of users) {
  const profile = (await sql.query(`select username, display_name, avatar_url from profiles where id = $1::uuid`, [u.id])) as Array<{ username: string; display_name: string | null; avatar_url: string | null }>;
  const name = profile[0]?.display_name || u.name || profile[0]?.username || u.email.split("@")[0]!;
  const google = (u.identities ?? []).find((i) => i.provider === "google");
  const bcrypt = u.hash && u.hash.startsWith("$2") ? u.hash : null;
  const res = (await sql.query(
    `insert into "user" (id, name, email, "emailVerified", image, "needsPasswordReset", "createdAt", "updatedAt")
     values ($1, $2, lower($3), $4, $5, $6, $7, $8) on conflict (id) do nothing returning id`,
    [u.id, name, u.email, !!u.email_confirmed_at, profile[0]?.avatar_url ?? u.image, !bcrypt && !google, u.created_at, u.updated_at],
  )) as unknown[];
  imported += res.length;
  if (bcrypt) {
    await sql.query(
      `insert into account (id, "accountId", "providerId", "userId", password) values ($1, $2, 'credential', $2, $3)
       on conflict ("providerId", "accountId") do nothing`,
      [crypto.randomUUID(), u.id, bcrypt],
    );
  }
  if (google) {
    await sql.query(
      `insert into account (id, "accountId", "providerId", "userId") values ($1, $2, 'google', $3)
       on conflict ("providerId", "accountId") do nothing`,
      [crypto.randomUUID(), google.sub, u.id],
    );
  }
}
const counts = (await sql.query(`select (select count(*)::int from "user") as users, (select count(*)::int from account) as accounts, (select count(*)::int from "user" where "needsPasswordReset") as reset`)) as unknown[];
console.log("imported", imported, "of", users.length, counts[0]);
