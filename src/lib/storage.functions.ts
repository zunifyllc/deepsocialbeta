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

/** Short-lived signed read URLs for post media. */
export const signMediaUrls = createServerFn({ method: "POST" })
  .validator((input) => z.object({ paths: z.array(z.string().min(1).max(500)).max(40) }).parse(input))
  .handler(async ({ data }) => {
    if (data.paths.length === 0) return [] as { path: string; signedUrl: string }[];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: urls } = await supabaseAdmin.storage.from("media").createSignedUrls(data.paths, 60 * 60);
    return (urls ?? [])
      .filter((u) => u.path && u.signedUrl)
      .map((u) => ({ path: u.path as string, signedUrl: u.signedUrl as string }));
  });
