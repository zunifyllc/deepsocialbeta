// File storage stays on the old backend; access is brokered server-side because
// the browser no longer holds an old-backend session.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-middleware";

const bucketSchema = z.enum(["media", "avatars", "banners"]);

/** Signed upload URL for a path inside the caller's own folder. */
export const createUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) =>
    z.object({ bucket: bucketSchema, fileName: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const safe = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${context.userId}/${Date.now()}-${crypto.randomUUID()}-${safe}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(data.bucket)
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error("Could not prepare upload");
    const { data: pub } = supabaseAdmin.storage.from(data.bucket).getPublicUrl(path);
    return { path, token: signed.token, publicUrl: pub.publicUrl };
  });

/** Deletes a media file the caller owns. */
export const deleteOwnMedia = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) => z.object({ path: z.string().min(1).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    if (!data.path.startsWith(`${context.userId}/`)) throw new Error("Not allowed");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from("media").remove([data.path]);
    return { ok: true };
  });

/**
 * Signed reads are allowed only for media referenced by published posts,
 * or files in the authenticated viewer's own upload folder.
 *
 * Supabase Admin bypasses Storage RLS, so NEVER sign arbitrary client paths.
 * Scheduled/draft post media remains private to the uploading account.
 */
function safeStoragePath(value: string): boolean {
  if (value.length > 500 || value.startsWith("/")) return false;
  const segments = value.split("/");
  return segments.length >= 2 && segments.every(
    (segment) => segment !== "." && segment !== ".." && /^[a-zA-Z0-9._-]+$/.test(segment),
  );
}

export const signMediaUrls = createServerFn({ method: "POST" })
  .validator((input) => z.object({ paths: z.array(z.string().min(1).max(500)).max(40) }).parse(input))
  .handler(async ({ data }) => {
    const paths = [...new Set(data.paths)].filter(safeStoragePath);
    if (paths.length === 0) return [] as { path: string; signedUrl: string }[];

    const [{ getViewerId }, { q }] = await Promise.all([
      import("./privacy-helpers.server"),
      import("./neon/core.server"),
    ]);
    const viewerId = await getViewerId();

    // Use a database whitelist rather than trusting the caller to say which
    // post or author a path belongs to. Only PUBLISHED posts are public.
    const published = await q<{ path: string }>(
      `select distinct media.path
       from public.posts p
       cross join lateral unnest(p.media_urls) as media(path)
       where p.status = 'published' and media.path = any($1::text[])`,
      [paths],
    );
    const publicPaths = new Set(published.map((row) => row.path));
    const allowed = paths.filter(
      (path) => publicPaths.has(path) || (viewerId !== null && path.startsWith(`${viewerId}/`)),
    );
    if (!allowed.length) return [] as { path: string; signedUrl: string }[];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: urls, error } = await supabaseAdmin.storage
      .from("media")
      .createSignedUrls(allowed, 60 * 60);
    if (error) throw new Error("Could not load post media");
    return (urls ?? [])
      .filter((u) => u.path && u.signedUrl)
      .map((u) => ({ path: u.path as string, signedUrl: u.signedUrl as string }));
  });
