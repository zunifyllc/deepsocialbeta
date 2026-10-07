import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const toggleLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    await W.ensureActor(context.supabase, context.userId);
    const target = await W.postAuthor(data.postId);
    if (!target) throw new Error("Post not found");
    if (target.author_id !== context.userId) {
      const { assertNotBlocked } = await import("./privacy-helpers.server");
      await assertNotBlocked(context.userId, target.author_id);
    }
    return W.toggleLike(context.userId, data.postId);
  });

export const getLikeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { isLiked } = await import("./neon/social.server");
    return { liked: await isLiked(context.userId, data.postId) };
  });
