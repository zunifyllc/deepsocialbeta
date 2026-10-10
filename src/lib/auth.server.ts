// Server-only Better Auth instance backed by Neon. Auth user ids are UUIDs and
// equal profiles.id. Built lazily so secrets are read at request time.
import { betterAuth } from "better-auth";
import { verifyPassword } from "better-auth/crypto";
import { Pool } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { getDatabaseUrl } from "@/lib/neon.server";

const ALLOWED_HOSTS = ["localhost:*", "*.lovable.app", "*.lovableproject.com", "*.vercel.app"];

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

function build() {
  const google =
    process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]
      ? { google: { clientId: process.env["GOOGLE_CLIENT_ID"], clientSecret: process.env["GOOGLE_CLIENT_SECRET"] } }
      : {};
  return betterAuth({
    database: new Pool({ connectionString: getDatabaseUrl() }),
    secret: process.env["BETTER_AUTH_SECRET"],
    baseURL: { allowedHosts: ALLOWED_HOSTS, fallback: process.env["BETTER_AUTH_URL"] },
    trustedOrigins: [
      "http://localhost:*",
      "https://*.lovable.app",
      "https://*.lovableproject.com",
      "https://*.vercel.app",
      ...(process.env["BETTER_AUTH_URL"] ? [process.env["BETTER_AUTH_URL"]] : []),
    ],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      autoSignIn: true,
      password: {
        // Imported accounts keep their original bcrypt hashes.
        verify: async ({ hash, password }) =>
          hash.startsWith("$2") ? bcrypt.compare(password, hash) : verifyPassword({ hash, password }),
      },
    },
    socialProviders: google,
    account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
    user: { additionalFields: { needsPasswordReset: { type: "boolean", defaultValue: false, input: false } } },
    databaseHooks: {
      user: { create: { after: async (user) => createProfileFor(user) } },
    },
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      useSecureCookies: true,
      // The editor preview runs in an iframe, so cookies must be cross-site capable.
      defaultCookieAttributes: { sameSite: "none", secure: true, partitioned: true },
    },
  });
}

type Auth = ReturnType<typeof build>;
let cached: { key: string; auth: Auth } | undefined;

export function getAuth(): Auth {
  const key = `${getDatabaseUrl()}|${process.env["BETTER_AUTH_SECRET"] ?? ""}|${process.env["GOOGLE_CLIENT_ID"] ?? ""}`;
  if (!cached || cached.key !== key) cached = { key, auth: build() };
  return cached.auth;
}

/** The signed-in user's id for a request, or null. */
export async function getSessionUserId(headers: Headers): Promise<string | null> {
  const session = await getAuth().api.getSession({ headers });
  return session?.user.id ?? null;
}

export { createProfileFor };
