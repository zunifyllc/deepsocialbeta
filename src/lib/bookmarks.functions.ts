import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-middleware";
import type { Post } from "./posts.functions";

export const toggleBookmark = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    await W.ensureActor(context.userId);
    return W.toggleBookmark(context.userId, data.postId);
  });

export const getBookmarkStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getBookmark } = await import("./neon/social.server");
    const existing = await getBookmark(context.userId, data.postId);
    return {
      isBookmarked: !!existing,
      bookmarkId: existing?.id ?? null,
      collectionId: existing?.collection_id ?? null,
    };
  });

export const getBookmarkedPosts = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((input) =>
    z
      .object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().datetime().optional(),
        /** "all" = every bookmark, "unsorted" = no collection, "collection" = a specific one. */
        scope: z.enum(["all", "unsorted", "collection"]).default("all"),
        collectionId: z.string().uuid().nullish(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { listBookmarkedPosts } = await import("./neon/social.server");
    const rows = await listBookmarkedPosts(context.userId, {
      limit: data.limit,
      cursor: data.cursor,
      scope: data.scope,
      collectionId: data.collectionId ?? null,
    });
    return rows as unknown as Post[];
  });

export interface BookmarkCollection {
  id: string;
  name: string;
  created_at: string;
  bookmarkCount: number;
}

export const createCollection = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) => z.object({ name: z.string().trim().min(1).max(50) }).parse(input))
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    await W.ensureActor(context.userId);
    const collection = await W.createCollection(context.userId, data.name);
    return { ...collection, bookmarkCount: 0 } as BookmarkCollection;
  });

export const getMyCollections = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { listCollections } = await import("./neon/social.server");
    const result = await listCollections(context.userId);
    return {
      collections: result.collections as BookmarkCollection[],
      totalCount: result.totalCount,
      unsortedCount: result.unsortedCount,
    };
  });

export const deleteCollection = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) => z.object({ collectionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    await W.deleteCollection(context.userId, data.collectionId);
    return { deleted: true };
  });

export const moveBookmark = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) =>
    z
      .object({
        bookmarkId: z.string().uuid(),
        collectionId: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    await W.moveBookmark(context.userId, data.bookmarkId, data.collectionId);
    return { collectionId: data.collectionId };
  });

/** Convenience wrapper matching the spec name. */
export const getBookmarksByCollection = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((input) =>
    z
      .object({
        collectionId: z.string().uuid(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().datetime().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { listBookmarkedPosts } = await import("./neon/social.server");
    const rows = await listBookmarkedPosts(context.userId, {
      limit: data.limit,
      cursor: data.cursor,
      scope: "collection",
      collectionId: data.collectionId,
    });
    return rows as unknown as Post[];
  });
