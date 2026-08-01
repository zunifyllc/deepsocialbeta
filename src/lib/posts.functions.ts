import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createPublicClient } from "./supabase-public";
import { fetchRepostFeedItems, mergeFeedItems, POST_WITH_AUTHOR } from "./feed-helpers";

export interface PostAuthor {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified?: boolean;
}

export interface Post {
  id: string;
  content: string;
  parent_post_id: string | null;
  media_urls: string[] | null;
  like_count: number;
  reply_count: number;
  repost_count: number;
  created_at: string;
  updated_at: string;
  author: PostAuthor | null;
  /** Present when this feed item is a repost of the post above. */
  repost?: {
    id: string;
    reposted_at: string;
    quote_content: string | null;
    repostedBy: PostAuthor;
  } | null;
  /** Stable key for feed rendering (a post can appear once per reposter). */
  feedKey?: string;
}

const createPostSchema = z.object({
  content: z.string().min(1).max(280),
  parentPostId: z.string().uuid().optional(),
  mediaUrls: z.array(z.string().url()).max(4).default([]),
});

const postWithAuthor = POST_WITH_AUTHOR;

export const getFeed = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        type: z.enum(["for-you", "following", "global"]),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().datetime().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const supabase = createPublicClient();
    let query = supabase
      .from("posts")
      .select(postWithAuthor)
      .is("parent_post_id", null)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.cursor) {
      query = query.lt("created_at", data.cursor);
    }

    const { data: posts, error } = await query;
    if (error) throw error;

    const reposts = await fetchRepostFeedItems(supabase, {
      limit: data.limit,
      ...(data.cursor ? { cursor: data.cursor } : {}),
    });

    return mergeFeedItems(
      (posts ?? []) as unknown as Post[],
      reposts as unknown as Post[],
      data.limit,
    );
  });

export const getPost = createServerFn({ method: "GET" })
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const supabase = createPublicClient();
    const { data: post, error } = await supabase
      .from("posts")
      .select(postWithAuthor)
      .eq("id", data.postId)
      .maybeSingle();
    if (error) throw error;
    return (post ?? null) as unknown as Post | null;
  });

export const getReplies = createServerFn({ method: "GET" })
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const supabase = createPublicClient();
    const { data: replies, error } = await supabase
      .from("posts")
      .select(postWithAuthor)
      .eq("parent_post_id", data.postId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (replies ?? []) as unknown as Post[];
  });

export const getUserPosts = createServerFn({ method: "GET" })
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
    let query = supabase
      .from("posts")
      .select(postWithAuthor)
      .eq("author_id", data.userId)
      .is("parent_post_id", null)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.cursor) {
      query = query.lt("created_at", data.cursor);
    }

    const { data: posts, error } = await query;
    if (error) throw error;

    const reposts = await fetchRepostFeedItems(supabase, {
      userId: data.userId,
      limit: data.limit,
      ...(data.cursor ? { cursor: data.cursor } : {}),
    });

    return mergeFeedItems(
      (posts ?? []) as unknown as Post[],
      reposts as unknown as Post[],
      data.limit,
    );
  });

export const createPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => createPostSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: post, error } = await context.supabase
      .from("posts")
      .insert({
        author_id: context.userId,
        content: data.content,
        parent_post_id: data.parentPostId ?? null,
        media_urls: data.mediaUrls,
      })
      .select(postWithAuthor)
      .single();
    if (error) throw error;
    return post as unknown as Post;
  });

export const deletePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("posts")
      .delete()
      .eq("id", data.id)
      .eq("author_id", context.userId);
    if (error) throw error;
    return { success: true };
  });
