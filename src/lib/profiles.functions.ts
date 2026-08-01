import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createPublicClient } from "./supabase-public";
import { POST_WITH_AUTHOR } from "./feed-helpers";
import type { Post } from "./posts.functions";

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  pinned_post_id: string | null;
  created_at: string;
  updated_at: string;
}

const profileSchema = z.object({
  display_name: z.string().max(50).optional(),
  bio: z.string().max(160).optional(),
  location: z.string().max(30).optional(),
  website: z.string().max(100).optional(),
  avatar_url: z.string().url().optional(),
  banner_url: z.string().url().optional(),
});

export const getProfileByUsername = createServerFn({ method: "GET" })
  .validator((input) => z.object({ username: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const supabase = createPublicClient();
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("username", data.username)
      .maybeSingle();
    if (error) throw error;
    return (profile ?? null) as unknown as Profile | null;
  });

export const getCurrentProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .single();
    if (error) throw error;
    return profile as unknown as Profile;
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => profileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const update = {
      display_name: data.display_name ?? null,
      bio: data.bio ?? null,
      location: data.location ?? null,
      website: data.website ?? null,
      avatar_url: data.avatar_url ?? null,
      banner_url: data.banner_url ?? null,
    };
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .update(update)
      .eq("id", context.userId)
      .select()
      .single();
    if (error) throw error;
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
    return profile as unknown as Profile;
  });

export const getPinnedPost = createServerFn({ method: "GET" })
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const supabase = createPublicClient();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("pinned_post_id")
      .eq("id", data.userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.pinned_post_id) return null;

    const { data: post, error } = await supabase
      .from("posts")
      .select(POST_WITH_AUTHOR)
      .eq("id", profile.pinned_post_id)
      .maybeSingle();
    if (error) throw error;
    return (post ?? null) as unknown as Post | null;
  });
