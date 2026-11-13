# DeepSocial: scheduled publishing using a Neon Function Trigger

The existing protected endpoint `GET /api/public/cron/publish-scheduled` calls
`public.publish_scheduled_posts()` in the **deepsocial** Postgres database.

## Production schedule (Neon Free + Vercel Hobby compatible)

Deploy `functions/scheduled-publisher/index.js` as a Neon Function with slug
`postpublisher` on Neon production branch `br-cold-band-b3f0dbnu`.
Set its encrypted function environment:
- `PUBLISH_ENDPOINT=https://deepsocialbeta.vercel.app/api/public/cron/publish-scheduled`
- `PUBLISH_CRON_SECRET=<the same long random value as Vercel CRON_SECRET>`

In Neon, configure a **schedule** Function Trigger named
`deepsocial-publish-scheduled-posts`, cron `* * * * *` UTC, function
`postpublisher`, path `/`, enabled on the production branch.

The Function refuses non-POST requests and requests without Neon-injected
`X-Neon-Trigger-Invocation-Id`. Neon strips spoofed `X-Neon-*` headers.
The existing Vercel endpoint independently validates `CRON_SECRET`.
Never put either secret in source control, browser bundles, or logs.

## How to verify

1. Confirm the Neon Function's active deployment is `completed`.
2. Confirm a direct `POST` to its URL returns HTTP 401 without a trigger.
3. Confirm the Vercel publisher endpoint returns 401 without the bearer token.
4. Check Neon's trigger invocation status and Function logs for successful
   scheduled execution. A successful run with no due posts is legitimate.
5. In isolated Preview, create a scheduled post 2+ minutes ahead, run the
   preview schedule using a **Preview-scoped** secret and confirm it transitions
   to published at or after the specified time. Do not use Production
   credentials to publish Preview test posts, or vice versa.

Unlike `pg_cron`, Neon Function Triggers can wake scale-to-zero computes. The
native Function trigger replaces the earlier proposed external cron-job.org
workflow and does not require a Vercel Hobby cron configuration.
