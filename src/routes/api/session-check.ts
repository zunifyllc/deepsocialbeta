import { createFileRoute } from "@tanstack/react-router";

/**
 * Minimal authenticated health check for managed Neon Auth.
 * Returns no user details and never accepts a caller-supplied user id.
 */
async function check(request: Request): Promise<Response> {
  const { getSessionUserId } = await import("@/lib/auth.server");
  const userId = await getSessionUserId(request.headers);
  if (!userId) {
    return Response.json({ authenticated: false }, { status: 401 });
  }
  return Response.json({ authenticated: true }, { headers: { "Cache-Control": "no-store" } });
}

export const Route = createFileRoute("/api/session-check")({
  staticData: { sitemap: false },
  server: { handlers: { GET: ({ request }) => check(request) } },
});
