import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-middleware";
import { mergeFeedItems } from "./feed-helpers";
import { pollInputSchema } from "./poll-helpers";
import { assertFutureSchedule } from "./schedule-helpers";

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

/** Post reads are served from Neon; mute/block lists still come from Supabase. */
async function readers() {
  const [posts, privacy] = await Promise.all([
    import("./neon/posts.server"),
    import("./privacy-helpers.server"),
  ]);
  return { posts, hidden: await privacy.getViewerHiddenAuthorIds() };
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
    const { posts, hidden } = await readers();
    const opts = { limit: data.limit, hidden, cursor: data.cursor };
    const [plain, reposts] = await Promise.all([
      posts.listFeedPosts(opts),
      posts.listRepostFeedItems(opts),
    ]);
    return mergeFeedItems(plain as unknown as Post[], reposts as unknown as Post[], data.limit);
  });

export const getPost = createServerFn({ method: "GET" })
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { posts, hidden } = await readers();
    const found = (await posts.getPostById(data.postId)) as unknown as Post | null;
    if (found?.author && hidden.includes(found.author.id)) return null;
    return found;
  });

export const getReplies = createServerFn({ method: "GET" })
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { posts, hidden } = await readers();
    return (await posts.listReplies(data.postId, hidden)) as unknown as Post[];
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
    const { posts, hidden } = await readers();
    if (hidden.includes(data.userId)) return [] as Post[];
    const opts = { limit: data.limit, hidden, cursor: data.cursor };
    const [plain, reposts] = await Promise.all([
      posts.listUserPosts(data.userId, opts),
      posts.listRepostFeedItems({ ...opts, userId: data.userId }),
    ]);
    return mergeFeedItems(plain as unknown as Post[], reposts as unknown as Post[], data.limit);
  });

export const createPost = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) => createPostSchema.parse(input))
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    await W.ensureActor(context.userId);
    if (data.scheduledAt) assertFutureSchedule(data.scheduledAt);
    if (data.parentPostId) {
      const parent = await W.postAuthor(data.parentPostId);
      if (parent && parent.author_id !== context.userId) {
        const { assertNotBlocked } = await import("./privacy-helpers.server");
        await assertNotBlocked(context.userId, parent.author_id);
      }
    }
    return (await W.createPost(context.userId, data)) as unknown as Post;
  });

export const editPost = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) =>
    z.object({ postId: z.string().uuid(), newContent: z.string().min(1).max(280) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    return (await W.editPost(context.userId, data.postId, data.newContent)) as unknown as Post;
  });

export const deletePost = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    await W.deletePost(context.userId, data.id);
    return { success: true };
  });

/**
 * Posts liked by a user. Likes are private, so this only returns rows when a
 * user requests their own likes.
 */
export const getUserLikedPosts = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (data.userId !== context.userId) return [] as Post[];
    const { listLikedPosts } = await import("./neon/posts.server");
    return (await listLikedPosts(context.userId)) as unknown as Post[];
  });

export const getScheduledPosts = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { listScheduledPosts } = await import("./neon/posts.server");
    return (await listScheduledPosts(context.userId)) as unknown as Post[];
  });

export const publishNow = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    await W.publishNow(context.userId, data.postId);
    return { success: true };
  });

export const cancelScheduledPost = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    await W.cancelScheduledPost(context.userId, data.postId);
    return { success: true };
  });

export const updateScheduledPost = createServerFn({ method: "POST" })
  .middleware([requireAuth])
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
    const W = await import("./neon/writes.server");
    if (data.scheduledAt) assertFutureSchedule(data.scheduledAt);
    return (await W.updateScheduledPost(context.userId, data.postId, data)) as unknown as Post;
  });
