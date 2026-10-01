import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const toggleFollow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ followingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (data.followingId === context.userId) {
      throw new Error("Cannot follow yourself");
    }

    const { assertNotBlocked } = await import("./privacy-helpers.server");
    await assertNotBlocked(context.userId, data.followingId);

    const mirror = await import("./neon/mirror.server");

    const { data: existing } = await context.supabase
      .from("follows")
      .select("id")
      .eq("follower_id", context.userId)
      .eq("following_id", data.followingId)
      .maybeSingle();

    if (existing) {
      const { error } = await context.supabase.from("follows").delete().eq("id", existing.id);
      if (error) throw error;
      await mirror.mirrorRowDelete("follows", existing.id);
      return { following: false };
    }

    const { data: inserted, error } = await context.supabase
      .from("follows")
      .insert({ follower_id: context.userId, following_id: data.followingId })
      .select("*")
      .single();
    if (error) throw error;

    await mirror.mirrorProfile(context.supabase, data.followingId);
    await mirror.mirrorRow(context.supabase, "follows", inserted, { userId: context.userId });

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
    const { getFollowState } = await import("./neon/social.server");
    return getFollowState(context.userId, data.followingId);
  });

export const getFollowCounts = createServerFn({ method: "GET" })
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getFollowCounts: readCounts } = await import("./neon/social.server");
    return readCounts(data.userId);
  });

export const getSuggestedUsers = createServerFn({ method: "GET" })
  .validator((input) => z.object({ limit: z.number().min(1).max(20).default(5) }).parse(input))
  .handler(async ({ data }) => {
    const [{ getViewerHiddenAuthorIds }, { listSuggestedUsers }] = await Promise.all([
      import("./privacy-helpers.server"),
      import("./neon/social.server"),
    ]);
    const hidden = await getViewerHiddenAuthorIds();
    return listSuggestedUsers(data.limit, hidden);
  });
