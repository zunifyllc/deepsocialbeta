# Scheduled posts on Vercel Hobby (external scheduler)

DeepSocial already exposes `GET /api/public/cron/publish-scheduled`. The endpoint calls the Neon publisher and requires `CRON_SECRET`. **Never put the secret in a query string, source code, or a public screenshot.**

Vercel Hobby only supports daily built-in cron invocations. For minute-level scheduled posts use an external HTTPS scheduler, such as [cron-job.org](https://cron-job.org/).

## Production checklist

1. Deploy the **reviewed and tested** Neon-backed application to production. Ensure `DATABASE_URL` points to the correct production Neon database and its migration containing `public.publish_scheduled_posts()` has been applied. Do not point the external scheduler at an isolated preview database.
2. In Vercel project Settings → Environment Variables, create a strong random `CRON_SECRET` for **Production**. Redeploy after saving it. Do not reuse an auth cookie or database password.
3. Confirm the production URL can reach `/api/public/cron/publish-scheduled`. With no secret the endpoint must return HTTP **401**. If Vercel Deployment Protection/SSO intercepts the request, configure the appropriate production access protection or use a suitable public production custom domain while retaining the endpoint's secret check. Do not expose preview deployments or disable all protection unnecessarily.
4. In cron-job.org, create a cronjob targeting `https://YOUR-PRODUCTION-DOMAIN/api/public/cron/publish-scheduled`, HTTP **GET**, schedule **every minute**.
5. Set a **custom request header** named `Authorization`, value `Bearer YOUR_CRON_SECRET`. The endpoint also supports an `x-cron-secret` header, but only one secret-bearing header is necessary.
6. Run one manual test and verify **HTTP 200** with `{ "ok": true, "published": <number> }`. Use a dedicated test post scheduled in the past (or wait for a future scheduled test post); verify it publishes exactly once and is visible on the feed. Examine server logs on a failure. A 401 means secret mismatch, 403/login redirect often means deployment protection, and 500 means inspect the server/database logs.
7. Enable failure notifications and monitor scheduler executions. Disable the external scheduler before rotating `CRON_SECRET`, then update both Vercel and the scheduler and redeploy.

**Notes:** A run once per minute means publication may lag behind the requested second. External scheduler uptime, network delays and function execution are not guaranteed. Vercel function usage still counts toward Hobby limits. If deploying a commercial service, review Vercel Hobby's non-commercial-use restrictions before launch.

No external cronjob or production secret is created by this repository change; those are separate service-side setup steps.
