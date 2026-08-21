import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createPublicClient } from "./supabase-public";
import { fetchRepostFeedItems, mergeFeedItems, POST_WITH_AUTHOR } from "./feed-helpers";
import { hoursToInterval, pollInputSchema } from "./poll-helpers";
import { canEditPost } from "./post-edit-helpers";

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
  edited_at?: string | null;
  is_edited?: boolean;
  status?: string;
  scheduled_at?: string | null;
  author: PostAuthor | null;
  /** Present when this feed item is a repost of the post above. */
  repost?: {
    id: string;
    reposted_at: string;
    quote_content: string | null;
    repostedBy: PostAuthor;
  } | null;
  /** Attached poll, when the post has one. */
  poll?: { id: string } | { id: string }[] | null;
  /** Bookmark row id, when the post came from a bookmark list. */
  bookmarkId?: string;
  /** Bookmark collection the post is filed under, when known. */
  collectionId?: string | null;
  /** Stable key for feed rendering (a post can appear once per reposter). */
  feedKey?: string;
}

const createPostSchema = z.object({
  content: z.string().min(1).max(280),
  parentPostId: z.string().uuid().optional(),
  mediaUrls: z.array(z.string().min(1).max(500)).max(4).default([]),
  poll: pollInputSchema.optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
});

/** Scheduled posts must be at least this far in the future. */
const MIN_SCHEDULE_LEAD_MS = 5 * 60 * 1000;

function assertFutureSchedule(scheduledAt: string) {
  if (new Date(scheduledAt).getTime() - Date.now() < MIN_SCHEDULE_LEAD_MS) {
    throw new Error("Pick a time at least 5 minutes from now");
  }
}

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
      .select(POST_WITH_AUTHOR)
      .eq("status", "published")
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
      .select(POST_WITH_AUTHOR)
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
      .select(POST_WITH_AUTHOR)
      .eq("status", "published")
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
      .select(POST_WITH_AUTHOR)
      .eq("author_id", data.userId)
      .eq("status", "published")
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
    if (data.scheduledAt) assertFutureSchedule(data.scheduledAt);
    const { data: post, error } = await context.supabase
      .from("posts")
      .insert({
        author_id: context.userId,
        content: data.content,
        parent_post_id: data.parentPostId ?? null,
        media_urls: data.mediaUrls,
        status: data.scheduledAt ? "scheduled" : "published",
        scheduled_at: data.scheduledAt ?? null,
        ...(data.scheduledAt ? { created_at: data.scheduledAt } : {}),
      })
      .select(POST_WITH_AUTHOR)
      .single();
    if (error) throw error;

    const created = post as unknown as Post;

    if (data.poll) {
      const { data: poll, error: pollError } = await context.supabase
        .from("polls")
        .insert({ post_id: created.id, duration: hoursToInterval(data.poll.durationHours) })
        .select("id")
        .single();
      if (pollError) {
        // Keep the post/poll pair consistent: drop the post if the poll fails.
        await context.supabase.from("posts").delete().eq("id", created.id);
        throw pollError;
      }
      const { error: optionsError } = await context.supabase.from("poll_options").insert(
        data.poll.options.map((content, index) => ({
          poll_id: poll.id,
          content,
          position: index + 1,
        })),
      );
      if (optionsError) {
        await context.supabase.from("posts").delete().eq("id", created.id);
        throw optionsError;
      }
      created.poll = { id: poll.id };
    }

    return created;
  });

export const editPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ postId: z.string().uuid(), newContent: z.string().min(1).max(280) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: existing, error: fetchError } = await context.supabase
      .from("posts")
      .select("id, author_id, created_at")
      .eq("id", data.postId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing || existing.author_id !== context.userId) {
      throw new Error("You can only edit your own posts");
    }
    if (!canEditPost(existing.created_at)) {
      throw new Error("Editing window has expired");
    }

    const { data: post, error } = await context.supabase
      .from("posts")
      .update({ content: data.newContent, edited_at: new Date().toISOString(), is_edited: true })
      .eq("id", data.postId)
      .eq("author_id", context.userId)
      .select(POST_WITH_AUTHOR)
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

/**
 * Posts liked by a user. Likes are private (RLS scopes reads to the owner),
 * so this only returns rows when a user requests their own likes.
 */
export const getUserLikedPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (data.userId !== context.userId) return [] as Post[];
    const { data: rows, error } = await context.supabase
      .from("likes")
      .select(`created_at, post:posts!likes_post_id_fkey(${POST_WITH_AUTHOR})`)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return ((rows ?? [])
      .map((row) => (row as unknown as { post: Post | null }).post)
      .filter(Boolean)) as Post[];
  });

export const getScheduledPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: posts, error } = await context.supabase
      .from("posts")
      .select(POST_WITH_AUTHOR)
      .eq("author_id", context.userId)
      .eq("status", "scheduled")
      .order("scheduled_at", { ascending: true });
    if (error) throw error;
    return (posts ?? []) as unknown as Post[];
  });

async function requireOwnScheduledPost(
  supabase: { from: (t: "posts") => any },
  postId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("posts")
    .select("id, author_id, status")
    .eq("id", postId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.author_id !== userId) throw new Error("You can only manage your own posts");
  if (data.status !== "scheduled") throw new Error("This post is already published");
}

export const publishNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireOwnScheduledPost(context.supabase, data.postId, context.userId);
    const { error } = await context.supabase
      .from("posts")
      .update({ status: "published", scheduled_at: null, created_at: new Date().toISOString() })
      .eq("id", data.postId)
      .eq("author_id", context.userId);
    if (error) throw error;
    return { success: true };
  });

export const cancelScheduledPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireOwnScheduledPost(context.supabase, data.postId, context.userId);
    const { error } = await context.supabase
      .from("posts")
      .delete()
      .eq("id", data.postId)
      .eq("author_id", context.userId);
    if (error) throw error;
    return { success: true };
  });

export const updateScheduledPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        postId: z.string().uuid(),
        content: z.string().min(1).max(280).optional(),
        mediaUrls: z.array(z.string().min(1).max(500)).max(4).optional(),
        scheduledAt: z.string().datetime().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOwnScheduledPost(context.supabase, data.postId, context.userId);
    if (data.scheduledAt) assertFutureSchedule(data.scheduledAt);

    const updates: Record<string, unknown> = {};
    if (data.content !== undefined) updates["content"] = data.content;
    if (data.mediaUrls !== undefined) updates["media_urls"] = data.mediaUrls;
    if (data.scheduledAt !== undefined) {
      updates["scheduled_at"] = data.scheduledAt;
      updates["created_at"] = data.scheduledAt;
    }

    const { data: post, error } = await context.supabase
      .from("posts")
      .update(updates)
      .eq("id", data.postId)
      .eq("author_id", context.userId)
      .select(POST_WITH_AUTHOR)
      .single();
    if (error) throw error;
    return post as unknown as Post;
  });
