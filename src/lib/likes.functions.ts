import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const toggleLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: target } = await context.supabase
      .from("posts")
      .select("author_id")
      .eq("id", data.postId)
      .maybeSingle();
    if (target && target.author_id !== context.userId) {
      const { assertNotBlocked } = await import("./privacy-helpers.server");
      await assertNotBlocked(context.userId, target.author_id);
    }

    const { data: existing } = await context.supabase
      .from("likes")
      .select("id")
      .eq("post_id", data.postId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (existing) {
      const { error } = await context.supabase.from("likes").delete().eq("id", existing.id);
      if (error) throw error;
      await context.supabase.rpc("decrement_like_count", { post_id: data.postId });
      return { liked: false };
    }

    const { error } = await context.supabase.from("likes").insert({
      post_id: data.postId,
      user_id: context.userId,
    });
    if (error) throw error;
    await context.supabase.rpc("increment_like_count", { post_id: data.postId });

    // Create notification
    const { data: post } = await context.supabase.from("posts").select("author_id").eq("id", data.postId).single();
    if (post && post.author_id !== context.userId) {
      await context.supabase.from("notifications").insert({
        user_id: post.author_id,
        actor_id: context.userId,
        type: "like",
        post_id: data.postId,
      });
    }

    return { liked: true };
  });

export const getLikeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing, error } = await context.supabase
      .from("likes")
      .select("id")
      .eq("post_id", data.postId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    return { liked: !!existing };
  });
