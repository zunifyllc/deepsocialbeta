/**
 * DeepSocial — Step 3: copy existing Supabase data into Neon.
 *
 * Read-only against Supabase (the source of truth), insert-only against Neon.
 * Idempotent: every insert uses ON CONFLICT DO NOTHING, so re-running never
 * duplicates or destroys rows. Nothing here touches the running application.
 *
 * Credentials are read from the environment only:
 *   - Supabase source: the standard PG* variables (PGHOST/PGUSER/... ) used by psql
 *   - Neon target:     DATABASE_URL
 * No credential is ever written to disk, logged, or shipped to the browser.
 *
 * Usage:  bun db/neon/migrate-data.ts [--verify-only]
 */
import { execFileSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) throw new Error("Missing DATABASE_URL (Neon target).");
const sql = neon(DATABASE_URL);

/** Insertion order respects foreign keys. */
const TABLES: Array<{ table: string; conflict: string }> = [
  { table: "profiles", conflict: "(id)" },
  { table: "user_roles", conflict: "(id)" },
  { table: "posts", conflict: "(id)" },
  { table: "likes", conflict: "(id)" },
  { table: "reposts", conflict: "(id)" },
  { table: "follows", conflict: "(id)" },
  { table: "bookmark_collections", conflict: "(id)" },
  { table: "bookmarks", conflict: "(id)" },
  { table: "notifications", conflict: "(id)" },
  { table: "notification_settings", conflict: "(user_id)" },
  { table: "conversations", conflict: "(id)" },
  { table: "messages", conflict: "(id)" },
  { table: "polls", conflict: "(id)" },
  { table: "poll_options", conflict: "(id)" },
  { table: "poll_votes", conflict: "(id)" },
  { table: "lists", conflict: "(id)" },
  { table: "list_members", conflict: "(list_id, user_id)" },
  { table: "post_impressions", conflict: "(id)" },
  { table: "profile_visits", conflict: "(id)" },
  { table: "muted_users", conflict: "(id)" },
  { table: "blocked_users", conflict: "(id)" },
];

/** Columns that point at a row in the same table — filled in a second pass. */
const SELF_REFERENCES: Record<string, string[]> = {
  posts: ["parent_post_id"],
  profiles: ["pinned_post_id"],
};

/** Runs a read-only query against Supabase through psql and returns JSON rows. */
function readSupabase<T>(query: string): T[] {
  const out = execFileSync("psql", ["-Atc", query], { encoding: "utf8" }).trim();
  return out && out !== "" ? (JSON.parse(out) as T[]) : [];
}

function sourceRows(table: string): Record<string, unknown>[] {
  return readSupabase<Record<string, unknown>>(
    `select coalesce(json_agg(t)::text, '[]') from public.${table} t`,
  ) as unknown as Record<string, unknown>[];
}

function sourceCount(table: string): number {
  const [row] = readSupabase<{ c: number }>(
    `select json_agg(x)::text from (select count(*)::int as c from public.${table}) x`,
  );
  return row?.c ?? 0;
}

async function targetCount(table: string): Promise<number> {
  const rows = (await sql.query(`select count(*)::int as c from public.${table}`)) as Array<{
    c: number;
  }>;
  return rows[0]?.c ?? 0;
}

async function setTriggers(enabled: boolean) {
  // Counter/updated_at triggers must not fire during a data copy, otherwise
  // migrated counts and timestamps would be rewritten.
  for (const { table } of TABLES) {
    await sql.query(
      `alter table public.${table} ${enabled ? "enable" : "disable"} trigger user`,
    );
  }
}

type TableResult = {
  table: string;
  source: number;
  inserted: number;
  skipped: number;
  failed: number;
  errors: string[];
};

async function copyTable(table: string, conflict: string): Promise<TableResult> {
  const rows = sourceRows(table);
  const result: TableResult = {
    table,
    source: rows.length,
    inserted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  if (rows.length === 0) return result;

  const selfRefs = SELF_REFERENCES[table] ?? [];
  const columns = Object.keys(rows[0]!);

  for (const row of rows) {
    const values = columns.map((column) => {
      const value = row[column];
      if (selfRefs.includes(column)) return null; // second pass fills these in
      return value === undefined ? null : value;
    });
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    const statement =
      `insert into public.${table} (${columns.map((c) => `"${c}"`).join(", ")}) ` +
      `values (${placeholders}) on conflict ${conflict} do nothing`;
    try {
      const inserted = (await sql.query(statement + " returning 1 as ok")) as unknown[];
      if (inserted.length > 0) result.inserted += 1;
      else result.skipped += 1;
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${String(row["id"] ?? "")}: ${message}`);
    }
  }

  // Second pass: restore self-referencing links now that all rows exist.
  for (const column of selfRefs) {
    for (const row of rows) {
      const target = row[column];
      if (!target) continue;
      try {
        await sql.query(
          `update public.${table} set "${column}" = $1 where id = $2`,
          [target, row["id"]],
        );
      } catch (error) {
        result.failed += 1;
        result.errors.push(
          `${String(row["id"])}.${column}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  return result;
}

/** Foreign-key / relationship integrity checks run inside Neon. */
async function integrityChecks() {
  const checks: Array<[string, string]> = [
    ["posts without an author profile", `select count(*)::int as c from posts p left join profiles f on f.id = p.author_id where f.id is null`],
    ["posts with a dangling parent", `select count(*)::int as c from posts p where p.parent_post_id is not null and not exists (select 1 from posts q where q.id = p.parent_post_id)`],
    ["likes with a dangling post or user", `select count(*)::int as c from likes l where not exists (select 1 from posts p where p.id = l.post_id) or not exists (select 1 from profiles f where f.id = l.user_id)`],
    ["reposts with a dangling post or user", `select count(*)::int as c from reposts r where not exists (select 1 from posts p where p.id = r.post_id) or not exists (select 1 from profiles f where f.id = r.user_id)`],
    ["follows with a dangling profile", `select count(*)::int as c from follows f where not exists (select 1 from profiles a where a.id = f.follower_id) or not exists (select 1 from profiles b where b.id = f.following_id)`],
    ["bookmarks with a dangling post/user/collection", `select count(*)::int as c from bookmarks b where not exists (select 1 from posts p where p.id = b.post_id) or not exists (select 1 from profiles f where f.id = b.user_id) or (b.collection_id is not null and not exists (select 1 from bookmark_collections c where c.id = b.collection_id))`],
    ["notifications with a dangling user/actor/post", `select count(*)::int as c from notifications n where not exists (select 1 from profiles u where u.id = n.user_id) or not exists (select 1 from profiles a where a.id = n.actor_id) or (n.post_id is not null and not exists (select 1 from posts p where p.id = n.post_id))`],
    ["messages with a dangling conversation/sender", `select count(*)::int as c from messages m where not exists (select 1 from conversations c where c.id = m.conversation_id) or not exists (select 1 from profiles f where f.id = m.sender_id)`],
    ["conversation participants without a profile", `select count(*)::int as c from (select distinct unnest(participants) as uid from conversations) x where not exists (select 1 from profiles f where f.id = x.uid)`],
    ["poll rows with a dangling parent", `select count(*)::int as c from (select 1 from polls p where not exists (select 1 from posts q where q.id = p.post_id) union all select 1 from poll_options o where not exists (select 1 from polls p where p.id = o.poll_id) union all select 1 from poll_votes v where not exists (select 1 from poll_options o where o.id = v.option_id)) y`],
    ["list members with a dangling list/user", `select count(*)::int as c from list_members m where not exists (select 1 from lists l where l.id = m.list_id) or not exists (select 1 from profiles f where f.id = m.user_id)`],
    ["analytics rows with a dangling post/profile", `select count(*)::int as c from (select 1 from post_impressions i where not exists (select 1 from posts p where p.id = i.post_id) or not exists (select 1 from profiles f where f.id = i.user_id) union all select 1 from profile_visits v where not exists (select 1 from profiles f where f.id = v.profile_id) or not exists (select 1 from profiles g where g.id = v.visitor_id)) z`],
    ["mute/block rows with a dangling profile", `select count(*)::int as c from (select 1 from muted_users m where not exists (select 1 from profiles a where a.id = m.muted_by) or not exists (select 1 from profiles b where b.id = m.muted_user_id) union all select 1 from blocked_users bl where not exists (select 1 from profiles a where a.id = bl.blocked_by) or not exists (select 1 from profiles b where b.id = bl.blocked_user_id)) w`],
    ["admin roles with a dangling profile", `select count(*)::int as c from user_roles r where not exists (select 1 from profiles f where f.id = r.user_id)`],
    ["pinned posts that do not exist", `select count(*)::int as c from profiles f where f.pinned_post_id is not null and not exists (select 1 from posts p where p.id = f.pinned_post_id)`],
  ];
  const results: Array<{ check: string; orphans: number }> = [];
  for (const [label, query] of checks) {
    const rows = (await sql.query(query)) as Array<{ c: number }>;
    results.push({ check: label, orphans: rows[0]?.c ?? 0 });
  }
  return results;
}

/** Row-level fidelity spot check on the tables that carry user content. */
async function contentChecks() {
  const out: Array<{ check: string; supabase: string; neon: string; match: boolean }> = [];
  const pairs: Array<[string, string]> = [
    ["profiles fingerprint", `select md5(string_agg(id::text || '|' || username || '|' || coalesce(display_name,'') || '|' || created_at::text, ',' order by id)) as v from public.profiles`],
    ["posts fingerprint", `select md5(string_agg(id::text || '|' || author_id::text || '|' || content || '|' || coalesce(parent_post_id::text,'') || '|' || created_at::text, ',' order by id)) as v from public.posts`],
    ["engagement fingerprint", `select md5(coalesce((select string_agg(id::text, ',' order by id) from public.likes),'') || ':' || coalesce((select string_agg(id::text, ',' order by id) from public.reposts),'') || ':' || coalesce((select string_agg(id::text, ',' order by id) from public.follows),'')) as v`],
  ];
  for (const [label, query] of pairs) {
    const [srcRow] = readSupabase<{ v: string | null }>(
      `select json_agg(x)::text from (${query}) x`,
    );
    const rows = (await sql.query(query)) as Array<{ v: string | null }>;
    const supabase = srcRow?.v ?? "(empty)";
    const neon = rows[0]?.v ?? "(empty)";
    out.push({ check: label, supabase, neon, match: supabase === neon });
  }
  return out;
}

async function main() {
  const verifyOnly = process.argv.includes("--verify-only");
  const results: TableResult[] = [];

  if (!verifyOnly) {
    await setTriggers(false);
    try {
      for (const { table, conflict } of TABLES) {
        results.push(await copyTable(table, conflict));
      }
    } finally {
      await setTriggers(true);
    }
    console.log("\n=== Records migrated ===");
    console.table(
      results.map((r) => ({
        table: r.table,
        source: r.source,
        inserted: r.inserted,
        "skipped (already present)": r.skipped,
        failed: r.failed,
      })),
    );
    const problems = results.filter((r) => r.failed > 0);
    if (problems.length === 0) console.log("No failed or dropped records.");
    else for (const p of problems) console.log(`FAILED ${p.table}:`, p.errors.slice(0, 5));
  }

  console.log("\n=== Row count comparison (Supabase vs Neon) ===");
  const counts: Array<{ table: string; supabase: number; neon: number; match: boolean }> = [];
  for (const { table } of TABLES) {
    const supabase = sourceCount(table);
    const neon = await targetCount(table);
    counts.push({ table, supabase, neon, match: supabase === neon });
  }
  console.table(counts);

  console.log("\n=== Foreign key / relationship integrity (Neon) ===");
  console.table(await integrityChecks());

  console.log("\n=== Content fidelity ===");
  console.table(await contentChecks());

  const countsOk = counts.every((c) => c.match);
  console.log(
    `\nRow counts match: ${countsOk ? "YES" : "NO"} — total rows in Neon: ${counts.reduce(
      (sum, c) => sum + c.neon,
      0,
    )}`,
  );
}

await main();
