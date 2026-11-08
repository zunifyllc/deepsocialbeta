import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request): Promise<Response> {
  // Keep the remaining app functional even before an UploadThing account has
  // been connected; never expose the server token to the browser.
  if (!process.env["UPLOADTHING_TOKEN"]) {
    return Response.json(
      { error: "Media uploads are not configured yet" },
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
