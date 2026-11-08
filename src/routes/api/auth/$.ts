import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request): Promise<Response> {
  const { handleAuthProxyRequest } = await import("@neondatabase/auth/server");
  const baseUrl = process.env["NEON_AUTH_BASE_URL"];
  const cookieSecret = process.env["NEON_AUTH_COOKIE_SECRET"];
  if (!baseUrl || !cookieSecret || cookieSecret.length < 32) {
    // Never expose internal env values to the browser.
    return Response.json({ error: "Authentication is not configured" }, { status: 503 });
  }
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith("/api/auth/")) {
    return new Response("Not Found", { status: 404 });
  }
  const path = pathname.slice("/api/auth/".length);
  return handleAuthProxyRequest({
    request,
    path,
    baseUrl,
    cookieSecret,
    sameSite: "lax",
  });
}

export const Route = createFileRoute("/api/auth/$")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
      PUT: ({ request }) => handle(request),
      PATCH: ({ request }) => handle(request),
      DELETE: ({ request }) => handle(request),
    },
  },
});
