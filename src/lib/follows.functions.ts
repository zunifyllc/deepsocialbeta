import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createPublicClient } from "./supabase-public";

export const toggleFollow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ followingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (data.followingId === context.userId) {
      throw new Error("Cannot follow yourself");
    }

    const { assertNotBlocked } = await import("./privacy-helpers.server");
    await assertNotBlocked(context.userId, data.followingId);

    const { data: existing } = await context.supabase
      .from("follows")
      .select("id")
      .eq("follower_id", context.userId)
      .eq("following_id", data.followingId)
      .maybeSingle();

    if (existing) {
      const { error } = await context.supabase.from("follows").delete().eq("id", existing.id);
      if (error) throw error;
      return { following: false };
    }

    const { error } = await context.supabase.from("follows").insert({
      follower_id: context.userId,
      following_id: data.followingId,
    });
    if (error) throw error;

    // Create notification
    await context.supabase.from("notifications").insert({
      user_id: data.followingId,
      actor_id: context.userId,
      type: "follow",
    });

    return { following: true };
  });

export const getFollowStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ followingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing, error } = await context.supabase
      .from("follows")
      .select("id")
      .eq("follower_id", context.userId)
      .eq("following_id", data.followingId)
      .maybeSingle();
    if (error) throw error;

    const { data: reverse, error: reverseError } = await context.supabase
      .from("follows")
      .select("id")
      .eq("follower_id", data.followingId)
      .eq("following_id", context.userId)
      .maybeSingle();
    if (reverseError) throw reverseError;

    return { following: !!existing, followedBy: !!reverse };
  });

export const getFollowCounts = createServerFn({ method: "GET" })
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const supabase = createPublicClient();
    const { data: counts, error } = await supabase.rpc("get_follow_counts", { user_uuid: data.userId });
    if (error) throw error;
    const result = Array.isArray(counts) ? counts[0] : counts;
    return {
      following: result?.following_count ?? 0,
      followers: result?.followers_count ?? 0,
    };
  });

export const getSuggestedUsers = createServerFn({ method: "GET" })
  .validator((input) => z.object({ limit: z.number().min(1).max(20).default(5) }).parse(input))
  .handler(async ({ data }) => {
    const supabase = createPublicClient();
    const { getViewerHiddenAuthorIds, excludeAuthors } = await import("./privacy-helpers.server");
    const hidden = await getViewerHiddenAuthorIds();
    const { data: users, error } = await excludeAuthors(
      supabase.from("profiles").select("id, username, display_name, avatar_url, bio"),
      hidden,
      "id",
    ).limit(data.limit);
    if (error) throw error;
    return users ?? [];
  });
