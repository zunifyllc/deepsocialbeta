// Copies all old-backend data into Neon through the service-level backend
// client (no direct Postgres login). Insert-only, ON CONFLICT DO NOTHING, so
// it is safe to re-run. Server-only.
import { getSql } from "@/lib/neon.server";

const TABLES: Array<{ table: string; key: string[] }> = [
  { table: "profiles", key: ["id"] },
  { table: "user_roles", key: ["id"] },
  { table: "posts", key: ["id"] },
  { table: "likes", key: ["id"] },
  { table: "reposts", key: ["id"] },
  { table: "follows", key: ["id"] },
  { table: "bookmark_collections", key: ["id"] },
  { table: "bookmarks", key: ["id"] },
  { table: "notifications", key: ["id"] },
  { table: "notification_settings", key: ["user_id"] },
  { table: "conversations", key: ["id"] },
  { table: "messages", key: ["id"] },
  { table: "polls", key: ["id"] },
  { table: "poll_options", key: ["id"] },
  { table: "poll_votes", key: ["id"] },
  { table: "lists", key: ["id"] },
  { table: "list_members", key: ["list_id", "user_id"] },
  { table: "post_impressions", key: ["id"] },
  { table: "profile_visits", key: ["id"] },
  { table: "muted_users", key: ["id"] },
  { table: "blocked_users", key: ["id"] },
];
const SELF_REFS: Record<string, string[]> = { posts: ["parent_post_id"], profiles: ["pinned_post_id"] };
const BATCH = 500;
type Row = Record<string, unknown>;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as {
    from: (t: string) => {
      select: (c: string, o?: { count: "exact"; head: boolean }) => {
        order: (c: string) => { order: (c: string) => unknown; range: (a: number, b: number) => Promise<{ data: Row[] | null; error: unknown }> };
      } & Promise<{ count: number | null; error: unknown }>;
    };
  };
}

async function readAll(table: string, key: string[]): Promise<Row[]> {
  const client = await admin();
  const out: Row[] = [];
  for (let from = 0; ; from += BATCH) {
    let query = client.from(table).select("*").order(key[0]!) as unknown as {
      order: (c: string) => unknown;
      range: (a: number, b: number) => Promise<{ data: Row[] | null; error: unknown }>;
    };
    for (const k of key.slice(1)) query = query.order(k) as typeof query;
    const { data, error } = await query.range(from, from + BATCH - 1);
    if (error) throw new Error(`${table}: ${JSON.stringify(error)}`);
    out.push(...(data ?? []));
    if (!data || data.length < BATCH) return out;
  }
}

async function sourceCount(table: string): Promise<number> {
  const client = await admin();
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${JSON.stringify(error)}`);
  return count ?? 0;
}

async function targetCount(table: string): Promise<number> {
  const rows = (await getSql().query(`select count(*)::int as c from public.${table}`)) as Array<{ c: number }>;
  return rows[0]?.c ?? 0;
}

async function setTriggers(enabled: boolean) {
  for (const { table } of TABLES) {
    await getSql().query(`alter table public.${table} ${enabled ? "enable" : "disable"} trigger user`);
  }
}

async function copyTable(table: string, key: string[]) {
  const rows = await readAll(table, key);
  let inserted = 0;
  const errors: string[] = [];
  if (rows.length === 0) return { inserted, errors };
  const selfRefs = SELF_REFS[table] ?? [];
  const cols = Object.keys(rows[0]!).map((c) => `"${c}"`).join(", ");
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH).map((r) => {
      const copy = { ...r };
      for (const c of selfRefs) copy[c] = null;
      return copy;
    });
    try {
      const res = (await getSql().query(
        `insert into public.${table} (${cols}) select ${cols} from jsonb_populate_recordset(null::public.${table}, $1::jsonb)
         on conflict do nothing returning 1`,
        [JSON.stringify(chunk)],
      )) as unknown[];
      inserted += res.length;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  for (const c of selfRefs) {
    const withRef = rows.filter((r) => r[c]).map((r) => ({ id: r["id"], [c]: r[c] }));
    if (!withRef.length) continue;
    try {
      await getSql().query(
        `update public.${table} t set "${c}" = x."${c}" from jsonb_populate_recordset(null::public.${table}, $1::jsonb) x
         where t.id = x.id and t."${c}" is distinct from x."${c}"`,
        [JSON.stringify(withRef)],
      );
    } catch (e) {
      errors.push(`${c}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { inserted, errors };
}

async function integrityChecks() {
  const sql = getSql();
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
  ];  const results: Array<{ check: string; orphans: number }> = [];
  for (const [check, query] of checks) {
    const rows = (await sql.query(query)) as Array<{ c: number }>;
    results.push({ check, orphans: rows[0]?.c ?? 0 });
  }
  return results;
}

async function compare() {
  const out: Array<{ table: string; source: number; neon: number }> = [];
  for (const { table } of TABLES) out.push({ table, source: await sourceCount(table), neon: await targetCount(table) });
  return out;
}

/** Full copy → verify → re-copy any table whose counts differ → re-verify. */
export async function runDataCopy() {
  const copy: Record<string, { inserted: number; errors: string[] }> = {};
  await setTriggers(false);
  try {
    for (const { table, key } of TABLES) copy[table] = await copyTable(table, key);
    let counts = await compare();
    const differing = counts.filter((c) => c.source !== c.neon).map((c) => c.table);
    if (differing.length) {
      for (const { table, key } of TABLES) if (differing.includes(table)) copy[table] = await copyTable(table, key);
      counts = await compare();
    }
    return { copy, counts, integrity: await integrityChecks() };
  } finally {
    await setTriggers(true);
  }
}
