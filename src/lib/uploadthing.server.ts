// UploadThing v7 file router. This module is server-only and never ships
// the UPLOADTHING_TOKEN to browsers.
import { createUploadthing, UploadThingError, UTApi } from "uploadthing/server";
import type { FileRouter } from "uploadthing/server";

const f = createUploadthing();

type UploadPurpose = "media" | "avatars" | "banners";

function createImageUploader(purpose: UploadPurpose) {
  // We use the uploaded file URL, not data returned by onUploadComplete.
  // Do not block the client while UploadThing polls for our Neon callback.
  // The callback still runs asynchronously to register the file's owner.
  return f({
    image: { maxFileSize: "8MB", maxFileCount: 1 },
  }, { awaitServerData: false })
    .middleware(async ({ req, files }) => {
      // UploadThing accepts power-of-two size literals. Enforce our strict 5MB
      // product limit and MIME allow-list BEFORE requesting signed upload URLs.
      const maxBytes = 5 * 1024 * 1024;
      const allowed = ["image/png", "image/jpeg", "image/gif", "image/webp"];
      if (files.some((file) => file.size > maxBytes || !allowed.includes(file.type))) {
        throw new UploadThingError("Only PNG, JPEG, GIF or WebP images up to 5MB are allowed");
      }
      const { getSessionUserId } = await import("./auth.server");
      const userId = await getSessionUserId(req.headers);
      if (!userId) throw new UploadThingError("Unauthorized");
      return { userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // Register ownership ONLY from UploadThing's server-side callback, not
      // from a user-submitted URL or file key. This prevents deleting others'
      // uploads and avoids trusting arbitrary client-provided metadata.
      const { q } = await import("./neon/core.server");
      await q(
        `insert into public.media_assets (file_key, owner_id, public_url, purpose)
         values ($1, $2::uuid, $3, $4)
         on conflict (file_key) do nothing`,
        [file.key, metadata.userId, file.ufsUrl, purpose],
      );
      return { url: file.ufsUrl };
    });
}

export const uploadRouter = {
  postImage: createImageUploader("media"),
  avatarImage: createImageUploader("avatars"),
  bannerImage: createImageUploader("banners"),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;

export function getUploadThingApi() {
  if (!process.env["UPLOADTHING_TOKEN"]) {
    throw new Error("UploadThing is not configured");
  }
  return new UTApi();
}
