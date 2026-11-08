# DeepSocial: Neon database and Vercel connection

## Target database (already created and schema applied)

| Setting | Value |
| --- | --- |
| Neon project | `DeepSocial` (`patient-leaf-98302482`) |
| Neon branch | `production` (`br-cold-band-b3f0dbnu`) |
| PostgreSQL database | `deepsocial` |
| Public application schema | `public` |
| Database tables | 25 (21 social + 4 self-managed Better Auth tables) |

The database was created on 2026-11-08. The existing migrations
`db/neon/migrations/0001_init_schema.sql` and
`db/neon/migrations/0002_better_auth.sql` were applied and the schema
verified. It currently has **no copied user or post data**. The separate
`neondb` database, including its managed `neon_auth` schema, was not modified.

## Connecting the app safely

1. In the [Neon Console](https://console.neon.tech/app/projects/patient-leaf-98302482),
   select **production** and the **deepsocial** database (not `neondb`).
   Copy its **pooled** PostgreSQL connection string. Handle it as a secret.
2. In the Vercel project linked to `zunifyllc/deepsocialbeta`, add
   `DATABASE_URL` as a **server-side environment variable**, initially for
   **Preview** only, pointing to the `deepsocial` database.
   Never prefix `DATABASE_URL` with `VITE_` and never commit it to GitHub.
3. Add a strong `BETTER_AUTH_SECRET` (32+ random characters) to Preview,
   plus `BETTER_AUTH_URL` set to the **actual HTTPS Preview origin** if a
   stable preview domain is available. Better Auth's allowed hosts already
   include `*.vercel.app` and `deepsocial.zunify.site`.
4. If Google sign-in is needed, add `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET` and configure Google's authorized redirect URI
   for `https://YOUR-DOMAIN/api/auth/callback/google`.
5. **Until media storage is migrated**, keep the existing Supabase storage
   credentials available on the server:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SUPABASE_PUBLISHABLE_KEY`; and expose only the publishable client
   variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
   The service role key must **never** use a `VITE_` prefix.
6. If scheduled posts are enabled, set a private `CRON_SECRET` and schedule
   calls to `/api/public/cron/publish-scheduled`. The endpoint is protected
   by that secret; a schedule is not configured by the existing repository.
7. Redeploy the Preview environment, then test: signup, login, Google OAuth,
   profile creation, create/read/like/delete post, follows, messaging, uploads
   and signed-out access. Check server logs and `/api/auth/*` status codes.

## Safety / cutover gate

- Do **not** change Production `DATABASE_URL` before migrating existing
  users/posts and validating the new database. Switching Production to an
  empty database would make existing accounts and content unavailable.
- Do **not** copy connection strings, service-role credentials, API secrets,
  or complete `.env` files into repository commits, issues, or PR comments.
- Never store sensitive credentials in `VITE_*` variables; Vite exposes
  them in client bundles.
- Repo currently includes a legacy tracked `.env` containing publishable
  Supabase configuration. Its values are not the new Neon secret. New real
  `.env` files should be ignored; note that `.gitignore` does not
  automatically untrack an already-committed `.env`.
- The Vite config currently uses Lovable's TanStack Start build wrapper
  (with a Cloudflare default target); **confirm Vercel deployment runtime
  compatibility** before attempting Production deployment.
- The CI TypeScript and production build checks are in draft PR #4; passing
  local/CI builds does not establish live Vercel runtime compatibility.

## Read-only schema verification

On the target `deepsocial` database:

```sql
SELECT count(*) AS app_tables
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

SELECT count(*) AS public_indexes
FROM pg_indexes WHERE schemaname = 'public';

SELECT count(*) AS profiles FROM public.profiles;
SELECT count(*) AS posts FROM public.posts;
SELECT count(*) AS auth_users FROM public."user";
```

Expected initial results: **25** app tables, **75** public indexes,
and zero profiles, posts, and Better Auth users. New users/posts will cause
the row counts to increase after staging testing.
