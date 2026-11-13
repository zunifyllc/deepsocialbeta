// Native Neon schedule calls the existing authenticated Vercel publisher.
// Neon strips spoofed X-Neon-* headers so only its trigger may invoke this.
export default async function handler(request) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!request.headers.get("x-neon-trigger-invocation-id")) {
    return new Response("Unauthorized", { status: 401 });
  }
  const secret = process.env.PUBLISH_CRON_SECRET;
  const endpoint = process.env.PUBLISH_ENDPOINT;
  if (!secret || !endpoint || !endpoint.startsWith("https://")) {
    return Response.json({ ok: false, error: "Publisher not configured" }, { status: 503 });
  }
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Authorization: "Bearer " + secret },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("Scheduled publishing returned status", response.status);
      return Response.json({ ok: false, status: response.status }, { status: 502 });
    }
    console.log("Scheduled publishing request successful");
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Scheduled publishing request failed", error instanceof Error ? error.message : String(error));
    return Response.json({ ok: false }, { status: 502 });
  }
}
