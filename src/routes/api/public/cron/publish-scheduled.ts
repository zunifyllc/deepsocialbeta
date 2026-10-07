// Scheduled-post publisher (Neon). Call every minute from Vercel Cron.
// Requires `Authorization: Bearer <CRON_SECRET>` (Vercel Cron's default) or
// an `x-cron-secret: <CRON_SECRET>` header.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function authorized(request: Request): boolean {
  const secret = process.env["CRON_SECRET"];
  if (!secret) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const header = request.headers.get("x-cron-secret") ?? "";
  const expected = Buffer.from(secret);
  return [bearer, header].some((value) => {
    const given = Buffer.from(value);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

async function run(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  try {
    const { publishScheduledPosts } = await import("@/lib/neon/writes.server");
    const published = await publishScheduledPosts();
    return Response.json({ ok: true, published });
  } catch (error) {
    console.error("[cron] publish-scheduled failed:", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/cron/publish-scheduled")({
  server: { handlers: { GET: ({ request }) => run(request), POST: ({ request }) => run(request) } },
});
