import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const { getAuth } = await import("@/lib/auth.server");
  return getAuth().handler(request);
}

export const Route = createFileRoute("/api/auth/$")({
  staticData: { sitemap: false },
  server: { handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) } },
});
