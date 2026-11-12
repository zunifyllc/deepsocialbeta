import { useQuery } from "@tanstack/react-query";
import { genUploader } from "uploadthing/client";
import type { UploadRouter } from "./uploadthing.server";
import { deleteOwnMedia, deleteOwnUploadThingMedia, signMediaUrls } from "./storage.functions";

const { uploadFiles } = genUploader<UploadRouter>();

export const MEDIA_BUCKET = "media";
export const MAX_MEDIA_PER_POST = 4;
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MEDIA_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

/** Returns an error message when the file is not an acceptable post image. */
export function validateMediaFile(file: File): string | null {
  if (!(ALLOWED_MEDIA_TYPES as readonly string[]).includes(file.type)) {
    return `${file.name}: only PNG, JPEG, GIF and WebP images are allowed.`;
  }
  if (file.size > MAX_MEDIA_BYTES) {
    return `${file.name}: images must be 5MB or smaller.`;
  }
  return null;
}

/** Uploads via UploadThing from the browser; no file bytes pass through Vercel. */
export async function uploadMediaFile(
  file: File,
  _userId: string,
  purpose: "media" | "avatars" | "banners" = "media",
): Promise<string> {
  const problem = validateMediaFile(file);
  if (problem) throw new Error(problem);

  const endpoint = purpose === "avatars" ? "avatarImage" : purpose === "banners" ? "bannerImage" : "postImage";
  const uploaded = await uploadFiles(endpoint, { files: [file] });
  const url = uploaded[0]?.url;
  if (!url) throw new Error("UploadThing did not return a file URL");
  return url;
}

/** Deletes only an upload owned by the caller; legacy Supabase paths still work. */
export async function deleteMediaFile(path: string): Promise<void> {
  if (isAbsoluteUrl(path)) {
    const url = new URL(path);
    if (url.hostname === "utfs.io" || url.hostname.endsWith(".ufs.sh")) {
      await deleteOwnUploadThingMedia({ data: { url: path } });
    }
    return;
  }
  await deleteOwnMedia({ data: { path } });
}

export function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

/** Resolves stored media references (storage paths or legacy absolute URLs) to displayable URLs. */
export function useMediaUrls(refs: string[] | null | undefined) {
  const list = refs ?? [];
  const { data } = useQuery({
    queryKey: ["media-urls", list],
    enabled: list.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const paths = list.filter((ref) => !isAbsoluteUrl(ref));
      const signed = new Map<string, string>();
      if (paths.length > 0) {
        const urls = await signMediaUrls({ data: { paths } });
        urls.forEach((entry) => signed.set(entry.path, entry.signedUrl));
      }
      return list.map((ref) => (isAbsoluteUrl(ref) ? ref : signed.get(ref) ?? ""));
    },
  });

  return data ?? list.map((ref) => (isAbsoluteUrl(ref) ? ref : ""));
}
