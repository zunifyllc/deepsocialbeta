import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Post } from "./posts.functions";

export const toggleBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const mirror = await import("./neon/mirror.server");

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
      await mirror.mirrorRowDelete("bookmarks", existing.id);
      return { isBookmarked: false };
    }

    const { data: inserted, error } = await context.supabase
      .from("bookmarks")
      .insert({ post_id: data.postId, user_id: context.userId })
      .select("*")
      .single();
    if (error) throw error;
    await mirror.mirrorRow(context.supabase, "bookmarks", inserted, {
      userId: context.userId,
      postId: data.postId,
    });
    return { isBookmarked: true };
  });

export const getBookmarkStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ name: z.string().trim().min(1).max(50) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: collection, error } = await context.supabase
      .from("bookmark_collections")
      .insert({ user_id: context.userId, name: data.name })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505" || error.code === "23000") throw new Error("You already have a collection with that name");
      throw error;
    }

    const { mirrorRow } = await import("./neon/mirror.server");
    await mirrorRow(context.supabase, "bookmark_collections", collection, {
      userId: context.userId,
    });

    return {
      id: collection.id,
      name: collection.name,
      created_at: collection.created_at,
      bookmarkCount: 0,
    } as BookmarkCollection;
  });

export const getMyCollections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ collectionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("bookmark_collections")
      .delete()
      .eq("id", data.collectionId)
      .eq("user_id", context.userId);
    if (error) throw error;
    // bookmarks.collection_id is ON DELETE SET NULL, so bookmarks revert to unsorted.
    const { mirrorRowDelete } = await import("./neon/mirror.server");
    await mirrorRowDelete("bookmark_collections", data.collectionId);
    return { deleted: true };
  });

export const moveBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        bookmarkId: z.string().uuid(),
        collectionId: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.collectionId) {
      const { data: owned, error: ownError } = await context.supabase
        .from("bookmark_collections")
        .select("id")
        .eq("id", data.collectionId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (ownError) throw ownError;
      if (!owned) throw new Error("Collection not found");
    }

    const { error } = await context.supabase
      .from("bookmarks")
      .update({ collection_id: data.collectionId })
      .eq("id", data.bookmarkId)
      .eq("user_id", context.userId);
    if (error) throw error;

    const { mirrorBookmarkCollection } = await import("./neon/mirror.server");
    await mirrorBookmarkCollection(data.bookmarkId, context.userId, data.collectionId);

    return { collectionId: data.collectionId };
  });

/** Convenience wrapper matching the spec name. */
export const getBookmarksByCollection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
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
