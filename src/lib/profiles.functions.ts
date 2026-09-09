import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [neon, mirror] = await Promise.all([
      import("./neon/profiles.server"),
      import("./neon/mirror.server"),
    ]);
    let profile = await neon.getProfileById(context.userId);
    if (!profile) {
      // New account created after the last copy — replicate it, then read again.
      await mirror.mirrorProfile(context.supabase, context.userId);
      profile = await neon.getProfileById(context.userId);
    }
    if (!profile) throw new Error("Profile not found");
    return profile as unknown as Profile;
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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

    const { data: profile, error } = await context.supabase
      .from("profiles")
      .update(update as never)
      .eq("id", context.userId)
      .select()
      .single();
    if (error) throw error;

    const { mirrorProfile } = await import("./neon/mirror.server");
    await mirrorProfile(context.supabase, context.userId);

    return profile as unknown as Profile;
  });

export const togglePinPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: post, error: postError } = await context.supabase
      .from("posts")
      .select("id, author_id")
      .eq("id", data.postId)
      .maybeSingle();
    if (postError) throw postError;
    if (!post || post.author_id !== context.userId) {
      throw new Error("You can only pin your own posts");
    }

    const { data: current, error: profileError } = await context.supabase
      .from("profiles")
      .select("pinned_post_id")
      .eq("id", context.userId)
      .single();
    if (profileError) throw profileError;

    const nextPinned = current.pinned_post_id === data.postId ? null : data.postId;

    const { data: profile, error } = await context.supabase
      .from("profiles")
      .update({ pinned_post_id: nextPinned })
      .eq("id", context.userId)
      .select()
      .single();
    if (error) throw error;

    const mirror = await import("./neon/mirror.server");
    if (nextPinned) await mirror.mirrorPost(context.supabase, nextPinned);
    await mirror.mirrorProfile(context.supabase, context.userId);

    return profile as unknown as Profile;
  });

export const getPinnedPost = createServerFn({ method: "GET" })
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getPinnedPost: readPinned } = await import("./neon/posts.server");
    return (await readPinned(data.userId)) as unknown as Post | null;
  });
