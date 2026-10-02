// Server-only query primitives for the Neon database.
//
// Every Neon read/write in the app goes through `q` / `one` here so parameter
// binding, table whitelisting and value normalisation live in one place.
// Import lazily from inside a server function handler:
//   const { q } = await import("@/lib/neon/core.server");
import { getSql } from "@/lib/neon.server";

export type Row = Record<string, unknown>;

/** Postgres returns timestamptz as Date; the app treats timestamps as ISO strings. */
function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out: Row = {};
    for (const [key, val] of Object.entries(value as Row)) out[key] = normalize(val);
    return out;
  }
  return value;
}

/** Runs a parameterised query and returns normalised rows. */
export async function q<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = getSql();
  const rows = (await client.query(text, params)) as unknown as Row[];
  return normalize(rows) as T[];
}

/** First row, or null. */
export async function one<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

/** Tables the mirror layer is allowed to write to. */
export const MIRROR_TABLES = [
  "profiles",
  "posts",
  "likes",
  "follows",
  "reposts",
  "bookmarks",
  "bookmark_collections",
  "notifications",
  "notification_settings",
  "conversations",
  "messages",
  "polls",
  "poll_options",
  "poll_votes",
  "lists",
  "list_members",
  "post_impressions",
  "profile_visits",
  "muted_users",
  "blocked_users",
] as const;
export type MirrorTable = (typeof MIRROR_TABLES)[number];

const IDENT = /^[a-z][a-z0-9_]*$/;

/** Insert-or-update a row by primary key. Column names are validated. */
export async function upsert(table: MirrorTable, row: Row, conflict = "id"): Promise<void> {
  if (!MIRROR_TABLES.includes(table)) throw new Error(`Table not mirrorable: ${table}`);
  const cols = Object.keys(row).filter((key) => IDENT.test(key));
  if (cols.length === 0) return;
  const values = cols.map((col) => row[col] ?? null);
  const updates = cols.filter((col) => col !== conflict).map((col) => `${col} = excluded.${col}`);
  const text =
    `insert into ${table} (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) ` +
    `on conflict (${conflict}) do update set ${updates.length ? updates.join(", ") : `${conflict} = excluded.${conflict}`}`;
  await q(text, values);
}

/** Delete a row by id. */
export async function removeById(table: MirrorTable, id: string): Promise<void> {
  if (!MIRROR_TABLES.includes(table)) throw new Error(`Table not mirrorable: ${table}`);
  await q(`delete from ${table} where id = $1`, [id]);
}
