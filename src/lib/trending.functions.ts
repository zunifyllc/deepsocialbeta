import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createPublicClient } from "./supabase-public";
import { POST_WITH_AUTHOR } from "./feed-helpers";
import type { Post } from "./posts.functions";

export interface TrendingHashtag {
  hashtag: string;
  post_count: number;
}

const trendingSchema = z.object({
  limit: z.number().min(1).max(50).default(10),
});

export const getTrendingHashtags = createServerFn({ method: "GET" })
  .validator((input) => trendingSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<TrendingHashtag[]> => {
    const supabase = createPublicClient();
    const { data: rows, error } = await supabase.rpc("get_trending_hashtags", {
      result_limit: data.limit,
    });
    if (error) throw error;
    return (rows ?? []).map((row) => ({
      hashtag: row.hashtag,
      post_count: Number(row.post_count),
    }));
  });

/** Escapes ILIKE wildcards so user input is matched literally. */
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

const hashtagSchema = z.object({
  hashtag: z.string().max(60).default(""),
  limit: z.number().min(1).max(50).default(30),
  offset: z.number().min(0).max(500).default(0),
});

export const getHashtagPosts = createServerFn({ method: "GET" })
  .validator((input) => hashtagSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<Post[]> => {
    const tag = data.hashtag.trim().replace(/^#/, "");
    if (!tag) return [];

    const supabase = createPublicClient();
    const { data: posts, error } = await supabase
      .from("posts")
      .select(POST_WITH_AUTHOR)
      .ilike("content", `%#${escapeLike(tag)}%`)
      .is("parent_post_id", null)
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw error;
    return (posts ?? []) as unknown as Post[];
  });
