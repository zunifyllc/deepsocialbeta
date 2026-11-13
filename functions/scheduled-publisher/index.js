// Neon Function Trigger handler for publishing scheduled DeepSocial posts.
// The Neon Auth database is "neondb"; social posts live in "deepsocial".
// SOCIAL_DATABASE_URL must point to the matching branch's deepsocial database.
import { Pool } from "pg";
import { attachDatabasePool } from "@neon/functions";

const connectionString = process.env.SOCIAL_DATABASE_URL;
if (!connectionString) {
  throw new Error("Missing SOCIAL_DATABASE_URL for deepsocial social database");
}
const pool = new Pool({ connectionString, max: 3 });
attachDatabasePool(pool);

export default async function handler(request) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  // Neon strips caller-supplied X-Neon-* headers; this header only exists
  // when invoked by its own scheduled trigger.
  if (!request.headers.get("x-neon-trigger-invocation-id")) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const { rows } = await pool.query(
      "select public.publish_scheduled_posts() as published"
    );
    console.log("Scheduled publisher trigger completed", { affected: rows.length });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Scheduled publisher failed", error instanceof Error ? error.message : String(error));
    return Response.json({ ok: false, error: "Publisher failed" }, { status: 500 });
  }
}
