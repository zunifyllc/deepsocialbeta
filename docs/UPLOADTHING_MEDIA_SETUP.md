# DeepSocial — UploadThing media (v7)

UploadThing replaces **new** image uploads on DeepSocial. The existing
Supabase media read path is retained so old images do not disappear.

## Implemented

- Three authenticated UploadThing file routes at `/api/uploadthing`:
  `postImage`, `avatarImage`, `bannerImage`.
- JPEG/PNG/GIF/WebP images, 5 MB per file, 1 file per upload request.
  The Post Composer can still attach up to four images.
- Uploads stream from the browser to UploadThing (not via Vercel's request body).
- Successful server callbacks register ownership in
  `deepsocial.public.media_assets`, with a foreign key to `public.profiles`.
- New images store their UploadThing CDN URL in existing post/profile columns.
- Only the authenticated asset owner can delete an unreferenced upload; a file
  still attached to a post or profile cannot be deleted.
- Legacy Supabase Storage paths can still be signed and displayed, using the
  existing Supabase server-side credentials.

## Database

`db/neon/migrations/0003_media_assets.sql` was applied to the
**isolated Preview** `deepsocial` database on 2026-11-08. Production has NOT
received this migration. Apply it to `production/deepsocial` only after
review and before enabling Production image uploads.

## Required UploadThing credential

Create an UploadThing app and copy its **v7 token** from its dashboard's
**API Keys → V7** area. This is a **base64-encoded JSON token** with the
required fields `apiKey`, `appId`, and `regions`; the old `sk_live_...`
API secret is **not** a V7 token and will fail on upload.

In Vercel project `deepsocialbeta` → Settings → Environment Variables,
**replace** `UPLOADTHING_TOKEN` with the entire **API Keys → V7** token
and make sure its only target is **Preview** (not Production). Do not commit
or paste the token into repository files, issues, PR comments, or
`VITE_*` variables. Redeploy Preview after updating it.

**Observed Preview QA on 2026-11-08:** a real browser signed up, created
a profile and posted text successfully; the UploadThing POST returned 500
with `Invalid token. A token is a base64 encoded JSON object matching
{ apiKey: string, appId: string, regions: string[] }`. Server code now
detects invalid token shapes up front and returns HTTP 503 instead of
misleadingly reporting GET health success. Retest real uploads after the
token is corrected.

Without this token, the upload API returns HTTP 503 and text-only posting
continues to work. Token configuration is not yet complete.

## Important before production launch

- Test a real login and UploadThing upload, confirm the `onUploadComplete`
  callback records the file in `media_assets`, then attach it to a post.
- **Vercel Deployment Protection can block UploadThing's callback** to a
  protected Preview URL. Ensure the callback endpoint can be reached securely
  in staging before treating the upload as tested.
- Existing Supabase-backed images require legacy credentials until every
  relevant reference has been migrated. Do not delete the old bucket yet.
- UploadThing's standard CDN URLs are public to anyone who knows them,
  including drafts before publication. If drafts must be private, add a
  private-file ACL and a signed-read flow before public launch.
- Orphaned old uploads and replacing profile image cleanup are further work.
- Do not merge this branch into `main` before the UploadThing token is
  configured and the post/avatar/banner upload flows are tested.
