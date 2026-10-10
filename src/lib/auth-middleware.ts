// Server-function auth: resolves the Better Auth session from request cookies.
// Server-only work stays inside .server() so nothing leaks into client bundles.
import { createMiddleware } from "@tanstack/react-start";

export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { getRequestHeaders } = await import("@tanstack/react-start/server");
  const { getSessionUserId } = await import("./auth.server");
  const userId = await getSessionUserId(new Headers(getRequestHeaders() as unknown as HeadersInit));
  if (!userId) throw new Response("Unauthorized", { status: 401 });
  return next({ context: { userId } });
});
