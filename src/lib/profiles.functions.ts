import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-middleware";
import type { Post } from "./posts.functions";

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  pronouns: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  pinned_post_id: string | null;
  is_verified: boolean;
  accent_color: string;
  theme_mode: "dark" | "black";
  created_at: string;
  updated_at: string;
  /** Set when a hard block hides this profile from the current viewer. */
  blockState?: "by-me" | "by-them" | null;
}

const profileSchema = z.object({
  display_name: z.string().max(50).nullish(),
  bio: z.string().max(160).nullish(),
  location: z.string().max(30).nullish(),
  website: z.string().max(100).nullish(),
  pronouns: z.string().max(20).nullish(),
  avatar_url: z.string().url().nullish(),
  banner_url: z.string().url().nullish(),
  accent_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Accent color must be a hex value like #1d9bf0")
    .optional(),
  theme_mode: z.enum(["dark", "black"]).optional(),
});

export const getProfileByUsername = createServerFn({ method: "GET" })
  .validator((input) => z.object({ username: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const neon = await import("./neon/profiles.server");
    const found = (await neon.getProfileByUsername(data.username)) as unknown as Profile | null;
    if (!found) return null;

    const { getViewerId, getBlockState } = await import("./privacy-helpers.server");
    const viewerId = await getViewerId();
    const blockState = viewerId ? await getBlockState(viewerId, found.id) : null;
    if (!blockState) return found;

    return {
      ...found,
      bio: null,
      banner_url: null,
      location: null,
      website: null,
      pinned_post_id: null,
      blockState,
    } as Profile;
  });

export const getCurrentProfile = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const [neon, W] = await Promise.all([import("./neon/profiles.server"), import("./neon/writes.server")]);
    await W.ensureActor(context.userId);
    const profile = await neon.getProfileById(context.userId);
    if (!profile) throw new Error("Profile not found");
    return profile as unknown as Profile;
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) => profileSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Only touch the fields the caller actually sent, so the appearance
    // settings screen cannot wipe bio/links and vice versa.
    const update: Record<string, string | null> = {};
    if ("display_name" in data) update["display_name"] = data.display_name ?? null;
    if ("bio" in data) update["bio"] = data.bio ?? null;
    if ("location" in data) update["location"] = data.location ?? null;
    if ("website" in data) update["website"] = data.website ?? null;
    if ("pronouns" in data) update["pronouns"] = data.pronouns?.trim() ? data.pronouns.trim() : null;
    if ("avatar_url" in data) update["avatar_url"] = data.avatar_url ?? null;
    if ("banner_url" in data) update["banner_url"] = data.banner_url ?? null;
    if (data.accent_color) update["accent_color"] = data.accent_color.toLowerCase();
    if (data.theme_mode) update["theme_mode"] = data.theme_mode;

    const W = await import("./neon/writes.server");
    await W.ensureActor(context.userId);
    return (await W.updateProfile(context.userId, update)) as unknown as Profile;
  });

export const togglePinPost = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    return (await W.togglePinPost(context.userId, data.postId)) as unknown as Profile;
  });

export const getPinnedPost = createServerFn({ method: "GET" })
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getPinnedPost: readPinned } = await import("./neon/posts.server");
    return (await readPinned(data.userId)) as unknown as Post | null;
  });
