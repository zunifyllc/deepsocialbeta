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
import { neon, neonConfig, Pool } from "@neondatabase/serverless";

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
  fn: (client: Awaited<ReturnType<Pool["connect"]>>) => Promise<T>,
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
    return { ok: true, now: rows[0]?.now };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
