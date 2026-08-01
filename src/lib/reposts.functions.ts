import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createPublicClient } from "./supabase-public";
import { fetchRepostFeedItems, readRepostCount, REPOST_WITH_POST } from "./feed-helpers";
import type { Post, PostAuthor } from "./posts.functions";

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
    const { data: existing } = await context.supabase
      .from("reposts")
      .select("id")
      .eq("post_id", data.postId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (existing) {
      const { error: delError } = await context.supabase.from("reposts").delete().eq("id", existing.id);
      if (delError) throw delError;

      // Undo repost — unless the user is quoting, in which case we replace it.
      if (!data.quoteContent) {
        const count = await readRepostCount(context.supabase, data.postId);
        return { isReposted: false, repostCount: count };
      }
    }

    const { error } = await context.supabase.from("reposts").insert({
      post_id: data.postId,
      user_id: context.userId,
      quote_content: data.quoteContent ?? null,
    });
    if (error) throw error;

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
    }

    const count = await readRepostCount(context.supabase, data.postId);
    return { isReposted: true, repostCount: count };
  });

export const getRepostStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing, error } = await context.supabase
      .from("reposts")
      .select("id")
      .eq("post_id", data.postId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    const count = await readRepostCount(context.supabase, data.postId);
    return { isReposted: !!existing, repostCount: count };
  });

export const getRepostsByPost = createServerFn({ method: "GET" })
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const supabase = createPublicClient();
    const { data: rows, error } = await supabase
      .from("reposts")
      .select(REPOST_WITH_POST)
      .eq("post_id", data.postId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return ((rows ?? []) as unknown as Array<{
      created_at: string;
      quote_content: string | null;
      user: PostAuthor | null;
    }>)
      .filter((row) => row.user)
      .map((row) => ({
        ...(row.user as PostAuthor),
        quote_content: row.quote_content,
        created_at: row.created_at,
      })) as RepostUser[];
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
    const supabase = createPublicClient();
    const items = await fetchRepostFeedItems(supabase, {
      userId: data.userId,
      limit: data.limit,
      ...(data.cursor ? { cursor: data.cursor } : {}),
    });
    return items as unknown as Post[];
  });
