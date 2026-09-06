// Server-only Neon PostgreSQL connection layer.
//
// SECURITY: this module reads DATABASE_URL from process.env and must never be
// imported from client code. The `.server.ts` suffix keeps it out of client
// bundles. Import it lazily inside a server function handler:
//
//   const { sql } = await import("@/lib/neon.server");
//   const rows = await sql`select 1 as ok`;
//
// Nothing in the app depends on this yet — Supabase remains the primary
// database, auth and storage provider.
import { neon, neonConfig, Pool, type PoolClient } from "@neondatabase/serverless";

// Cache connections per worker isolate so repeated requests reuse them.
neonConfig.fetchConnectionCache = true;

/** Reads DATABASE_URL at call time (env is injected per request on workers). */
export function getDatabaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error(
      "Missing DATABASE_URL. Add the Neon connection string as a backend secret.",
    );
  }
  return url;
}

/** True when a Neon connection string is configured. */
export function hasNeonDatabase(): boolean {
  return Boolean(process.env["DATABASE_URL"]);
}

type SqlClient = ReturnType<typeof neon>;

let cachedSql: SqlClient | undefined;
let cachedSqlUrl: string | undefined;

/**
 * HTTP-based query client — best for one-shot queries in server functions.
 * Usage: `const rows = await sql\`select * from posts where id = ${id}\``
 */
export function getSql(): SqlClient {
  const url = getDatabaseUrl();
  if (!cachedSql || cachedSqlUrl !== url) {
    cachedSql = neon(url);
    cachedSqlUrl = url;
  }
  return cachedSql;
}

/**
 * Tagged-template proxy so callers can write `sql\`...\`` directly without
 * constructing the client themselves. Resolves lazily on first use.
 */
export const sql: SqlClient = ((...args: Parameters<SqlClient>) =>
  (getSql() as (...a: Parameters<SqlClient>) => unknown)(...args)) as unknown as SqlClient;

let cachedPool: Pool | undefined;
let cachedPoolUrl: string | undefined;

/**
 * WebSocket pool — use only when a query needs a session or a transaction.
 * Prefer `sql` for ordinary reads and writes.
 */
export function getPool(): Pool {
  const url = getDatabaseUrl();
  if (!cachedPool || cachedPoolUrl !== url) {
    cachedPool = new Pool({ connectionString: url });
    cachedPoolUrl = url;
  }
  return cachedPool;
}

/** Runs `fn` inside a single transaction on a dedicated connection. */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Connectivity smoke test: returns the server time when reachable. */
export async function checkNeonConnection(): Promise<{ ok: boolean; now?: string; error?: string }> {
  try {
    const rows = (await getSql()`select now() as now`) as Array<{ now: string }>;
    const now = rows[0]?.now;
    return now ? { ok: true, now } : { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/** Tables the Neon schema is expected to provide (Step 2 replication). */
export const NEON_EXPECTED_TABLES = [
  "blocked_users",
  "bookmark_collections",
  "bookmarks",
  "conversations",
  "follows",
  "likes",
  "list_members",
  "lists",
  "messages",
  "muted_users",
  "notification_settings",
  "notifications",
  "poll_options",
  "poll_votes",
  "polls",
  "post_impressions",
  "posts",
  "profile_visits",
  "profiles",
  "reposts",
  "user_roles",
] as const;

export type NeonSchemaReport = {
  ok: boolean;
  tables: string[];
  missing: string[];
  indexes: number;
  foreignKeys: number;
  error?: string;
};

/**
 * Schema smoke test: confirms every replicated table exists in Neon and
 * reports index / foreign-key totals. Read-only.
 */
export async function checkNeonSchema(): Promise<NeonSchemaReport> {
  try {
    const client = getSql();
    const tableRows = (await client`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name
    `) as Array<{ table_name: string }>;
    const tables = tableRows.map((row) => row.table_name);
    const missing = NEON_EXPECTED_TABLES.filter((name) => !tables.includes(name));

    const indexRows = (await client`
      select count(*)::int as count from pg_indexes where schemaname = 'public'
    `) as Array<{ count: number }>;
    const fkRows = (await client`
      select count(*)::int as count from pg_constraint
      where contype = 'f' and connamespace = 'public'::regnamespace
    `) as Array<{ count: number }>;

    return {
      ok: missing.length === 0,
      tables,
      missing,
      indexes: indexRows[0]?.count ?? 0,
      foreignKeys: fkRows[0]?.count ?? 0,
    };
  } catch (error) {
    return {
      ok: false,
      tables: [],
      missing: [...NEON_EXPECTED_TABLES],
      indexes: 0,
      foreignKeys: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
