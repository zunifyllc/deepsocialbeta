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
      .select("id, collection_id")
      .eq("post_id", data.postId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
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
    let query = context.supabase
      .from("bookmarks")
      .select(`id, created_at, collection_id, post:posts!bookmarks_post_id_fkey(${POST_WITH_AUTHOR})`)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.scope === "unsorted") query = query.is("collection_id", null);
    if (data.scope === "collection" && data.collectionId) query = query.eq("collection_id", data.collectionId);
    if (data.cursor) query = query.lt("created_at", data.cursor);

    const { data: rows, error } = await query;
    if (error) throw error;

    return ((rows ?? []) as unknown as Array<{
      id: string;
      created_at: string;
      collection_id: string | null;
      post: Record<string, unknown> | null;
    }>)
      .filter((row) => row.post)
      .map((row) => ({
        ...(row.post as Record<string, unknown>),
        feedKey: `bookmark-${row.id}`,
        bookmarked_at: row.created_at,
        bookmarkId: row.id,
        collectionId: row.collection_id,
      })) as unknown as Post[];
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
      .select("id, name, created_at")
      .single();
    if (error) {
      if (error.code === "23505" || error.code === "23000") throw new Error("You already have a collection with that name");
      throw error;
    }
    return { ...collection, bookmarkCount: 0 } as BookmarkCollection;
  });

export const getMyCollections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: collections, error } = await context.supabase
      .from("bookmark_collections")
      .select("id, name, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const { data: rows, error: countError } = await context.supabase
      .from("bookmarks")
      .select("collection_id")
      .eq("user_id", context.userId);
    if (countError) throw countError;

    const counts = new Map<string, number>();
    let unsorted = 0;
    for (const row of rows ?? []) {
      if (row.collection_id) counts.set(row.collection_id, (counts.get(row.collection_id) ?? 0) + 1);
      else unsorted += 1;
    }

    return {
      collections: (collections ?? []).map((c) => ({
        ...c,
        bookmarkCount: counts.get(c.id) ?? 0,
      })) as BookmarkCollection[],
      totalCount: (rows ?? []).length,
      unsortedCount: unsorted,
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
    let query = context.supabase
      .from("bookmarks")
      .select(`id, created_at, collection_id, post:posts!bookmarks_post_id_fkey(${POST_WITH_AUTHOR})`)
      .eq("user_id", context.userId)
      .eq("collection_id", data.collectionId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.cursor) query = query.lt("created_at", data.cursor);

    const { data: rows, error } = await query;
    if (error) throw error;

    return ((rows ?? []) as unknown as Array<{
      id: string;
      created_at: string;
      collection_id: string | null;
      post: Record<string, unknown> | null;
    }>)
      .filter((row) => row.post)
      .map((row) => ({
        ...(row.post as Record<string, unknown>),
        feedKey: `bookmark-${row.id}`,
        bookmarkId: row.id,
        collectionId: row.collection_id,
      })) as unknown as Post[];
  });
