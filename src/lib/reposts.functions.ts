import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-middleware";
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
  .middleware([requireAuth])
  .validator((input) =>
    z
      .object({
        postId: z.string().uuid(),
        quoteContent: z.string().trim().min(1).max(280).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    await W.ensureActor(context.userId);
    const target = await W.postAuthor(data.postId);
    if (!target) throw new Error("Post not found");
    if (target.author_id !== context.userId) {
      const { assertNotBlocked } = await import("./privacy-helpers.server");
      await assertNotBlocked(context.userId, target.author_id);
    }
    const { countReposts } = await import("./neon/posts.server");
    const result = await W.toggleRepost(context.userId, data.postId, data.quoteContent);
    return { ...result, repostCount: await countReposts(data.postId) };
  });

export const getRepostStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
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
