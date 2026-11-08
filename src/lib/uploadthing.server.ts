// UploadThing v7 file router. This module is server-only and never ships
// the UPLOADTHING_TOKEN to browsers.
import { createUploadthing, UploadThingError, UTApi } from "uploadthing/server";
import type { FileRouter } from "uploadthing/server";

const f = createUploadthing();

type UploadPurpose = "media" | "avatars" | "banners";

function createImageUploader(purpose: UploadPurpose) {
  return f({
    image: { maxFileSize: "5MB", maxFileCount: 1 },
  })
    .middleware(async ({ req }) => {
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
