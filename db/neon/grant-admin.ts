/** One-time admin grant. Usage: bun db/neon/grant-admin.ts someone@example.com */
import { neon } from "@neondatabase/serverless";
const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw new Error("Usage: bun db/neon/grant-admin.ts <email>");
const sql = neon(process.env["DATABASE_URL"]!);
const rows = (await sql.query(
  `insert into user_roles (user_id, role)
   select u.id::uuid, 'admin' from "user" u where lower(u.email) = $1
   on conflict (user_id, role) do nothing returning user_id`,
  [email],
)) as unknown[];
const found = (await sql.query(`select 1 from "user" where lower(email) = $1`, [email])) as unknown[];
console.log(found.length ? (rows.length ? "admin granted" : "already admin") : "no user with that email");
