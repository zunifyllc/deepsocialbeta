import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

// The SDK defaults to the same-origin /api/auth proxy when baseURL is omitted,
// exactly as @neondatabase/auth/next does. Cookies never depend on third-party
// browser storage; the TanStack Start server proxies to the Neon Auth branch.
export const authClient = createAuthClient(undefined as unknown as string, {
  adapter: BetterAuthReactAdapter(),
});
