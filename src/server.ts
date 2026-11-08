import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/**
 * Neon Managed Auth OAuth returns a one-time verifier to the application.
 * Exchange it server-side using the official toolkit before TanStack handles
 * the callback page, preserving the signed session cookies on the redirect.
 */
async function finishNeonOAuthCallback(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.searchParams.has("neon_auth_session_verifier")) return null;

  const baseUrl = process.env["NEON_AUTH_BASE_URL"];
  const cookieSecret = process.env["NEON_AUTH_COOKIE_SECRET"];
  if (!baseUrl || !cookieSecret) return null;

  const { processAuthMiddleware, DEFAULT_AUTH_SKIP_ROUTES } =
    await import("@neondatabase/auth/server");
  const result = await processAuthMiddleware({
    request,
    pathname: url.pathname,
    skipRoutes: [...DEFAULT_AUTH_SKIP_ROUTES, "/", "/auth", "/explore"],
    loginUrl: "/auth",
    baseUrl,
    cookieSecret,
    sameSite: "lax",
  });
  if (result.action !== "redirect_oauth") return null;

  const response = new Response(null, {
    status: 302,
    headers: { Location: result.redirectUrl.toString() },
  });
  for (const cookie of result.cookies) response.headers.append("Set-Cookie", cookie);
  return response;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const oauthResponse = await finishNeonOAuthCallback(request);
      if (oauthResponse) return oauthResponse;
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
