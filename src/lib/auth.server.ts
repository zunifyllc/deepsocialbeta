// DeepSocial uses Neon Managed Auth (Better Auth hosted by Neon).
// This is server-only; auth sessions belong to the Neon preview/production
// branch's neon_auth schema, while social profiles live in deepsocial.public.
import { createAuthServer, extractNeonAuthCookies } from "@neondatabase/auth/server";
import { setCookie } from "@tanstack/react-start/server";

function sanitizeUsername(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 15);
}

/** Creates the Neon profile for a new auth user, with the same id. */
async function createProfileFor(user: { id: string; name: string; email: string; image?: string | null | undefined }) {
  const { q, one } = await import("@/lib/neon/core.server");
  if (await one(`select 1 from profiles where id = $1::uuid`, [user.id])) return;
  const fromName = sanitizeUsername(user.name ?? "");
  let base = /^[a-z0-9_]{3,15}$/.test(fromName) ? fromName : sanitizeUsername(user.email.split("@")[0] ?? "");
  if (base.length < 3) base = `user${base}`.padEnd(4, "0");
  let username = base;
  for (let n = 1; await one(`select 1 from profiles where username = $1`, [username]); n++) {
    username = `${base.slice(0, 15 - String(n).length)}${n}`;
  }
  await q(
    `insert into profiles (id, username, display_name, avatar_url) values ($1::uuid, $2, $3, $4)
     on conflict (id) do nothing`,
    [user.id, username, user.name || username, user.image ?? null],
  );
}


function requiredAuthConfig() {
  const baseUrl = process.env["NEON_AUTH_BASE_URL"];
  const cookieSecret = process.env["NEON_AUTH_COOKIE_SECRET"];
  if (!baseUrl || !cookieSecret || cookieSecret.length < 32) {
    throw new Error("Missing/invalid Neon Managed Auth server configuration.");
  }
  return { baseUrl, cookieSecret };
}

function requestOrigin(headers: Headers): string {
  const origin = headers.get("origin");
  if (origin) return origin;
  const referrer = headers.get("referer");
  if (referrer) {
    try {
      return new URL(referrer).origin;
    } catch {
      // Fall through to the forwarded host.
    }
  }
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  const protocol = headers.get("x-forwarded-proto") ?? "https";
  return host ? `${protocol}://${host}` : "";
}

/**
 * Validates the managed Neon Auth session using Neon Auth's signed cookie
 * toolkit. A client-provided user id is NEVER trusted for server functions.
 */
export async function getSessionUserId(headers: Headers): Promise<string | null> {
  const { baseUrl, cookieSecret } = requiredAuthConfig();
  const auth = createAuthServer({
    baseUrl,
    cookieSecret,
    context: () => ({
      getCookies: () => extractNeonAuthCookies(headers),
      getHeader: (name: string) => headers.get(name),
      getOrigin: () => requestOrigin(headers),
      getFramework: () => "tanstack-start",
      setCookie: (name, value, options) => {
        setCookie(name, value, options);
      },
    }),
  });

  const { data, error } = await auth.getSession();
  if (error || !data?.user) return null;
  const user = data.user;
  // Social schema keys are UUIDs, so fail closed for malformed identities.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user.id)) {
    return null;
  }
  // Managed Auth lives in `neondb.neon_auth` and does not run the old app's
  // user.create database hook. Provision the corresponding social profile on
  // the first verified request; never create one from unauthenticated input.
  await createProfileFor({
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
  });
  return user.id;
}

export { createProfileFor };
