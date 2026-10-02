import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Post } from "./posts.functions";

export interface RepostUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified?: boolean;
  quote_content: string | null;
  created_at: string;
}

export const toggleRepost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        postId: z.string().uuid(),
        quoteContent: z.string().trim().min(1).max(280).optional(),
      })
      .parse(input),
  )
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

    const mirror = await import("./neon/mirror.server");
    const { countReposts } = await import("./neon/posts.server");

    const { data: existing } = await context.supabase
      .from("reposts")
      .select("id")
      .eq("post_id", data.postId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (existing) {
      const { error: delError } = await context.supabase.from("reposts").delete().eq("id", existing.id);
      if (delError) throw delError;
      await mirror.mirrorRowDelete("reposts", existing.id);

      // Undo repost — unless the user is quoting, in which case we replace it.
      if (!data.quoteContent) {
        await mirror.syncPostCounters(context.supabase, data.postId);
        return { isReposted: false, repostCount: await countReposts(data.postId) };
      }
    }

    const { data: inserted, error } = await context.supabase
      .from("reposts")
      .insert({
        post_id: data.postId,
        user_id: context.userId,
        quote_content: data.quoteContent ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;

    await mirror.mirrorRow(context.supabase, "reposts", inserted, {
      userId: context.userId,
      postId: data.postId,
    });
    await mirror.syncPostCounters(context.supabase, data.postId);

    const { data: post } = await context.supabase
      .from("posts")
      .select("author_id")
      .eq("id", data.postId)
      .single();
    if (post && post.author_id !== context.userId) {
      await context.supabase.from("notifications").insert({
        user_id: post.author_id,
        actor_id: context.userId,
        type: "repost",
        post_id: data.postId,
      });
      await (await import("./neon/mirror.server")).resyncScope("notifications", "user_id", post.author_id);
    }

    return { isReposted: true, repostCount: await countReposts(data.postId) };
  });

export const getRepostStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const [{ isReposted }, { countReposts }] = await Promise.all([
      import("./neon/social.server"),
      import("./neon/posts.server"),
    ]);
    const [reposted, count] = await Promise.all([
      isReposted(context.userId, data.postId),
      countReposts(data.postId),
    ]);
    return { isReposted: reposted, repostCount: count };
  });

export const getRepostsByPost = createServerFn({ method: "GET" })
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { listRepostersByPost } = await import("./neon/social.server");
    return (await listRepostersByPost(data.postId)) as unknown as RepostUser[];
  });

export const getUserReposts = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().datetime().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const [{ getViewerHiddenAuthorIds }, { listRepostFeedItems }] = await Promise.all([
      import("./privacy-helpers.server"),
      import("./neon/posts.server"),
    ]);
    const hidden = await getViewerHiddenAuthorIds();
    const items = await listRepostFeedItems({
      userId: data.userId,
      limit: data.limit,
      hidden,
      cursor: data.cursor,
    });
    return items as unknown as Post[];
  });
