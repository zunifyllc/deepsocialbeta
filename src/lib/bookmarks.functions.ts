import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { POST_WITH_AUTHOR } from "./feed-helpers";
import type { Post } from "./posts.functions";

export const toggleBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing, error: readError } = await context.supabase
      .from("bookmarks")
      .select("id")
      .eq("post_id", data.postId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (readError) throw readError;

    if (existing) {
      const { error } = await context.supabase.from("bookmarks").delete().eq("id", existing.id);
      if (error) throw error;
      return { isBookmarked: false };
    }

    const { error } = await context.supabase
      .from("bookmarks")
      .insert({ post_id: data.postId, user_id: context.userId });
    if (error) throw error;
    return { isBookmarked: true };
  });

export const getBookmarkStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing, error } = await context.supabase
      .from("bookmarks")
      .select("id")
      .eq("post_id", data.postId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    return { isBookmarked: !!existing };
  });

export const getBookmarkedPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().datetime().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("bookmarks")
      .select(`id, created_at, post:posts!bookmarks_post_id_fkey(${POST_WITH_AUTHOR})`)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.cursor) query = query.lt("created_at", data.cursor);

    const { data: rows, error } = await query;
    if (error) throw error;

    return ((rows ?? []) as unknown as Array<{
      id: string;
      created_at: string;
      post: Record<string, unknown> | null;
    }>)
      .filter((row) => row.post)
      .map((row) => ({
        ...(row.post as Record<string, unknown>),
        feedKey: `bookmark-${row.id}`,
        bookmarked_at: row.created_at,
      })) as unknown as Post[];
  });
