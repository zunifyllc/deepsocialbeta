import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Uploads an image into the signed-in user's own media folder and returns its storage path. */
export async function uploadMediaFile(file: File, userId: string): Promise<string> {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "bin";
  const path = `${userId}/${randomId()}.${ext}`;
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function deleteMediaFile(path: string): Promise<void> {
  if (isAbsoluteUrl(path)) return;
  await supabase.storage.from(MEDIA_BUCKET).remove([path]);
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
        const { data: urls } = await supabase.storage
          .from(MEDIA_BUCKET)
          .createSignedUrls(paths, 60 * 60);
        urls?.forEach((entry) => {
          if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
        });
      }
      return list.map((ref) => (isAbsoluteUrl(ref) ? ref : signed.get(ref) ?? ""));
    },
  });

  return data ?? list.map((ref) => (isAbsoluteUrl(ref) ? ref : ""));
}
