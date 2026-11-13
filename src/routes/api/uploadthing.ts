import { createFileRoute } from "@tanstack/react-router";

/**
 * UploadThing v7 expects a base64-encoded JSON token with an API key, app ID
 * and region list. Earlier UploadThing secrets (sk_live_...) are incompatible.
 * Check the FORMAT only; the SDK validates credentials during requests.
 * Never log the token or decoded payload.
 */
function hasV7TokenShape(value: string | undefined): boolean {
  if (!value || !/^[A-Za-z0-9+/_=-]+$/.test(value)) return false;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return false;
    const token = parsed as Record<string, unknown>;
    return (
      typeof token["apiKey"] === "string" &&
      token["apiKey"].length > 0 &&
      typeof token["appId"] === "string" &&
      token["appId"].length > 0 &&
      Array.isArray(token["regions"]) &&
      token["regions"].length > 0 &&
      token["regions"].every((region) => typeof region === "string" && region.length > 0)
    );
  } catch {
    return false;
  }
}

async function handle(request: Request): Promise<Response> {
  const token = process.env["UPLOADTHING_TOKEN"];
  if (!hasV7TokenShape(token)) {
    // A missing/legacy token must not mislead operators with a healthy GET
    // file route list and a mysterious 500 only on real upload requests.
    return Response.json(
      { error: "Media uploads are not configured. Configure the UploadThing V7 token on this deployment." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const [{ createRouteHandler }, { uploadRouter }] = await Promise.all([
    import("uploadthing/server"),
    import("@/lib/uploadthing.server"),
  ]);
  const handler = createRouteHandler({ router: uploadRouter });
  return handler(request);
}

export const Route = createFileRoute("/api/uploadthing")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
